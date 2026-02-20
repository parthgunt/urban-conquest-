console.log("Map engine starting...");

mapboxgl.accessToken = "";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [79.16026965, 12.9714122],
  zoom: 15
});

let drawing = false;
let path = [];
let territories = [];
let lastLoopTime = 0;

map.on("load", () => {

  console.log("Map loaded");

  map.addSource("path", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: []
      }
    }
  });

  map.addLayer({
    id: "path-line",
    type: "line",
    source: "path",
    paint: {
      "line-color": "#ffffff",
      "line-width": 4
    }
  });

  map.on("click", () => {
    drawing = !drawing;
    if (drawing) path = [];
  });

  map.on("mousemove", (e) => {
    if (!drawing) return;

    const point = [e.lngLat.lng, e.lngLat.lat];
    path.push(point);

    map.getSource("path").setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: path
      }
    });

    // -----------------------------------------------------------------
    // LOGIC: LOOP DETECTION & TERRITORY EXPANSION
    // -----------------------------------------------------------------

    // 1. Check for Self-Loops (Kinks)
    // We only check if the path is long enough to potentially form a loop
    if (path.length > 5) {
      const lineString = turf.lineString(path);
      const kinks = turf.kinks(lineString);

      // Check A: Kinks (Self-intersections inside the path)
      if (kinks.features.length > 0) {
        // We found a self-intersection.
        const intersectPoint = kinks.features[0].geometry.coordinates;

        // Get the segment representing the loop: from intersection to the end (head)
        const loopSlice = turf.lineSlice(turf.point(intersectPoint), turf.point(path[path.length - 1]), lineString);

        // Filter out tiny jitters
        if (turf.length(loopSlice, { units: 'meters' }) > 10) {

          // Close the loop to make it a polygon
          const loopCoords = [...loopSlice.geometry.coordinates];
          if (distance(loopCoords[0], loopCoords[loopCoords.length - 1]) > 0.00001) {
            loopCoords.push(loopCoords[0]);
          }

          try {
            const poly = turf.lineToPolygon(turf.lineString(loopCoords));

            if (turf.area(poly) > 50) {
              createTerritory(poly, true); // true = attempt merge
              path = [intersectPoint];
              updatePathVisual();
              return;
            }
          } catch (err) {
            console.warn("Failed to create polygon from loop:", err);
          }
        }
      }

      // Check B: Explicit Closure (Head touches Start)
      const startPoint = path[0];
      const endPoint = path[path.length - 1];

      // Check distance (approx 20-30 meters)
      if (distance(startPoint, endPoint) < 0.0003) {
        // Verify we have enough length to call it a loop 
        if (turf.length(lineString, { units: 'meters' }) > 20) {
          // It's a full loop!
          try {
            const closedPath = [...path, path[0]];
            const poly = turf.lineToPolygon(turf.lineString(closedPath));

            if (turf.area(poly) > 50) {
              createTerritory(poly, true);
              path = [endPoint];
              updatePathVisual();
              return;
            }
          } catch (err) {
            console.warn("Failed to close explicit loop:", err);
          }
        }
      }
    }

    // 2. Check for Intersection with EXISTING Territories (Expansion)
    if (path.length > 2) {
      const lineString = turf.lineString(path);
      const startPoint = turf.point(path[0]);

      for (const tCoords of territories) {
        const tPoly = turf.polygon([tCoords]);

        // Check if the current line crosses the boundary of an existing territory
        const intersects = turf.lineIntersect(lineString, tPoly);

        // FILTER: Ignore intersections that are too close to the start of the drawing
        const validIntersects = intersects.features.filter(p => turf.distance(p, startPoint, {
          units: 'meters'
        }) > 10);

        if (validIntersects.length > 0) {
          // We hit a territory boundary FAR from where we started!

          // Close the path to form a polygon candidate
          const closedPath = [...path, path[0]];
          const poly = turf.lineToPolygon(turf.lineString(closedPath));

          // CRITICAL: Check Area to avoid "single lines" or "slivers"
          if (turf.area(poly) > 50) {
            try {
              createTerritory(poly, true); // MERGE

              // Reset path to the hit point
              const hitPoint = validIntersects[0].geometry.coordinates;
              path = [hitPoint];
              updatePathVisual();
              return;
            } catch (err) {
              console.warn("Expansion merge failed:", err);
            }
          }
        }
      }
    }

  });
});

function updatePathVisual() {
  map.getSource("path").setData({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: path
    }
  });
}


function getTotalDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}


function createTerritory(newPoly, tryMerge = false) {
  let finalPoly = newPoly;
  let otherTerritories = [];
  let merged = false;

  // 1. Merge logic (Expansion)
  if (tryMerge) {
    for (const tCoords of territories) {
      const tPoly = turf.polygon([tCoords]);

      // Check if they touch or overlap
      if (!turf.booleanDisjoint(finalPoly, tPoly)) {
        try {
          const union = turf.union(finalPoly, tPoly);
          if (union) {
            finalPoly = union; // Grow the new polygon
            merged = true;
          } else {
            otherTerritories.push(tCoords);
          }
        } catch (e) {
          otherTerritories.push(tCoords);
        }
      } else {
        otherTerritories.push(tCoords);
      }
    }

    if (merged) {
      // If we merged anything, our "base" set of territories to check against for overlaps
      // becomes the ones we didn't merge with.
      territories = otherTerritories;
    }
  }

  // 2. Overlap/Conquest logic
  // "finalPoly" is now our candidate (possibly merged).
  // We must subtract it from any *remaining* territories it overlaps with.
  let finalTerritories = [];

  for (const tCoords of territories) {
    const tPoly = turf.polygon([tCoords]);
    try {
      const diff = turf.difference(tPoly, finalPoly);
      if (diff) {
        // diff could be Polygon or MultiPolygon
        if (diff.geometry.type === "Polygon") {
          finalTerritories.push(diff.geometry.coordinates[0]);
        } else if (diff.geometry.type === "MultiPolygon") {
          diff.geometry.coordinates.forEach(c => finalTerritories.push(c[0]));
        }
      }
    } catch (e) {
      // If diff fails, keep original
      finalTerritories.push(tCoords);
    }
  }

  // Finally add our new/merged polygon
  if (finalPoly.geometry.type === "Polygon") {
    finalTerritories.push(finalPoly.geometry.coordinates[0]);
  } else if (finalPoly.geometry.type === "MultiPolygon") {
    finalPoly.geometry.coordinates.forEach(c => finalTerritories.push(c[0]));
  }

  territories = finalTerritories;
  renderTerritories();
}


function renderTerritories() {

  const data = {
    type: "FeatureCollection",
    features: territories.map(coords => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[...coords, coords[0]]]
      }
    }))
  };

  if (map.getSource("territories")) {
    map.getSource("territories").setData(data);
  } else {
    map.addSource("territories", {
      type: "geojson",
      data
    });

    map.addLayer({
      id: "territories",
      type: "fill",
      source: "territories",
      paint: {
        "fill-color": "#8f00ff",
        "fill-opacity": 0.45
      }
    });
  }

  // ✅ ALWAYS update area
  updateTotalArea();
}


function updateTotalArea() {
  let totalArea = 0;

  territories.forEach(coords => {
    const poly = turf.polygon([coords]);
    totalArea += turf.area(poly);
  });

  // Console output (debug)
  console.log("🌍 TOTAL AREA:", totalArea.toFixed(2), "m²");

  // UI output
  let areaStr = Math.round(totalArea) + " m²";
  if (totalArea > 1_000_000) {
    areaStr = (totalArea / 1_000_000).toFixed(2) + " km²";
  }

  const display = document.getElementById("area-display");
  if (display) {
    display.innerText = "Area: " + areaStr;
  }
}
