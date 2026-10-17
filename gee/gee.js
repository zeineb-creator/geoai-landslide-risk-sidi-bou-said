/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("projects/tp1-geomatics/assets/AOI"),
    table2 = ee.FeatureCollection("projects/tp1-geomatics/assets/negative_sampling_area_wgs84"),
    table3 = ee.FeatureCollection("projects/tp1-geomatics/assets/negative_sampling_area_v2_wgs84");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// ============================================================
// Sidi Bou Said — before/after Storm Harry imagery + NDVI change
// AOI: closure-zone polygon (uploaded as GEE asset)
// ============================================================

var aoi = ee.FeatureCollection("projects/tp1-geomatics/assets/AOI");
var aoiGeom = aoi.geometry();

var largerAoi = ee.FeatureCollection("projects/tp1-geomatics/assets/negative_sampling_area_wgs84");
var largerAoiGeom = largerAoi.geometry();

var largerAoiV2 = ee.FeatureCollection("projects/tp1-geomatics/assets/negative_sampling_area_v2_wgs84");
var largerAoiV2Geom = largerAoiV2.geometry();

// ---- BEFORE / AFTER search windows around Storm Harry (~late Jan 2026) ----
var beforeCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoiGeom)
  .filterDate('2026-01-01', '2026-01-18')
  .sort('CLOUDY_PIXEL_PERCENTAGE');

var afterCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoiGeom)
  .filterDate('2026-01-29', '2026-02-15')
  .sort('CLOUDY_PIXEL_PERCENTAGE');

print('Before scenes (sorted by cloud %):', beforeCollection);
print('After scenes (sorted by cloud %):', afterCollection);

// Take the clearest scene from each window
var beforeImage = ee.Image(beforeCollection.first()).clip(aoiGeom);
var afterImage = ee.Image(afterCollection.first()).clip(aoiGeom);

// ---- True/false color visualization ----
var trueColorVis = {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000};
var falseColorVis = {bands: ['B8', 'B4', 'B3'], min: 0, max: 4000}; // good for bare-soil/vegetation change

Map.centerObject(aoiGeom, 16);
Map.addLayer(beforeImage, trueColorVis, 'Before - True Color');
Map.addLayer(afterImage, trueColorVis, 'After - True Color');
Map.addLayer(beforeImage, falseColorVis, 'Before - False Color', false);
Map.addLayer(afterImage, falseColorVis, 'After - False Color', false);

// ---- Export raw clipped scenes to Drive ----
Export.image.toDrive({
  image: beforeImage.select(['B4', 'B3', 'B2', 'B8']),
  description: 'sidi_bou_said_before_storm',
  region: aoiGeom,
  scale: 10,
  crs: 'EPSG:32632',
  maxPixels: 1e9
});

Export.image.toDrive({
  image: afterImage.select(['B4', 'B3', 'B2', 'B8']),
  description: 'sidi_bou_said_after_storm',
  region: aoiGeom,
  scale: 10,
  crs: 'EPSG:32632',
  maxPixels: 1e9
});

// ---- Unmasked NDVI diff (kept only as a "before cleanup" comparison) ----
var ndviBefore = beforeImage.normalizedDifference(['B8', 'B4']).rename('NDVI_before');
var ndviAfter = afterImage.normalizedDifference(['B8', 'B4']).rename('NDVI_after');
var ndviDiff = ndviAfter.subtract(ndviBefore).rename('NDVI_diff');

var diffVis = {min: -0.5, max: 0.5, palette: ['red', 'white', 'green']};
Map.addLayer(ndviDiff, diffVis, 'NDVI Change (unmasked, for comparison)', false);

// ---- Cloud/cloud-shadow masking using the Scene Classification Layer (SCL) ----
// SCL codes removed: 3 = cloud shadow, 8/9 = cloud medium/high probability, 10 = thin cirrus
function maskS2clouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
  return image.updateMask(mask);
}
var beforeMasked = maskS2clouds(beforeImage);
var afterMasked = maskS2clouds(afterImage);

var ndviBeforeMasked = beforeMasked.normalizedDifference(['B8', 'B4']).rename('NDVI_before_masked');
var ndviAfterMasked = afterMasked.normalizedDifference(['B8', 'B4']).rename('NDVI_after_masked');
var ndviDiffMasked = ndviAfterMasked.subtract(ndviBeforeMasked).rename('NDVI_diff_masked');

// ---- Strong negative change only (real signal, not pixel-level noise) ----
var strongLoss = ndviDiffMasked.updateMask(ndviDiffMasked.lt(-0.2));
Map.addLayer(strongLoss, {min: -0.5, max: -0.2, palette: ['red']}, 'Strong NDVI loss (cloud-masked, <-0.2)');

// ---- Export the masked NDVI diff too, for later use in QGIS/label digitizing ----
Export.image.toDrive({
  image: ndviDiffMasked,
  description: 'sidi_bou_said_ndvi_diff_masked',
  region: aoiGeom,
  scale: 10,
  crs: 'EPSG:32632',
  maxPixels: 1e9
});


// ---- DEM and slope (small AOI — kept for reference / earlier steps) ----
var dem = ee.ImageCollection('COPERNICUS/DEM/GLO30')
  .filterBounds(aoiGeom)
  .select('DEM')
  .mosaic()
  .setDefaultProjection('EPSG:32632', null, 30)
  .clip(aoiGeom);

var slope = ee.Terrain.slope(dem).rename('slope_deg');
print('DEM tile count (small AOI):', ee.ImageCollection('COPERNICUS/DEM/GLO30').filterBounds(aoiGeom).size());
Map.addLayer(dem, {min: 0, max: 60, palette: ['blue', 'green', 'yellow', 'red']}, 'Elevation (m) - small AOI', false);
Map.addLayer(slope, {min: 0, max: 45, palette: ['white', 'yellow', 'orange', 'red']}, 'Slope (degrees) - small AOI', false);

Export.image.toDrive({
  image: dem,
  description: 'sidi_bou_said_dem',
  region: aoiGeom,
  scale: 30,
  crs: 'EPSG:32632',
  maxPixels: 1e9
});

Export.image.toDrive({
  image: slope,
  description: 'sidi_bou_said_slope',
  region: aoiGeom,
  scale: 30,
  crs: 'EPSG:32632',
  maxPixels: 1e9
});


// ---- DEM over the LARGER extent v1 (kept for reference — this was the 400m
// buffer that turned out to still miss the southwest zone) ----
var demLarge = ee.ImageCollection('COPERNICUS/DEM/GLO30')
  .filterBounds(largerAoiGeom)
  .select('DEM')
  .mosaic()
  .setDefaultProjection('EPSG:32632', null, 30)
  .clip(largerAoiGeom);

print('DEM tile count (larger AOI v1):', ee.ImageCollection('COPERNICUS/DEM/GLO30').filterBounds(largerAoiGeom).size());
Map.addLayer(demLarge, {min: 0, max: 60, palette: ['blue', 'green', 'yellow', 'red']}, 'Elevation (m) - LARGER AOI v1', false);


// ---- DEM over the CORRECTED larger extent (1100m buffer + fixed land
// polygon — this one covers both Zarrouk and the southwest zone) ----
var demLargeV2 = ee.ImageCollection('COPERNICUS/DEM/GLO30')
  .filterBounds(largerAoiV2Geom)
  .select('DEM')
  .mosaic()
  .setDefaultProjection('EPSG:32632', null, 30)
  .clip(largerAoiV2Geom);

print('DEM tile count (v2 fixed larger AOI):', ee.ImageCollection('COPERNICUS/DEM/GLO30').filterBounds(largerAoiV2Geom).size());
Map.addLayer(demLargeV2, {min: 0, max: 60, palette: ['blue', 'green', 'yellow', 'red']}, 'Elevation (m) - LARGER AOI v2 (fixed)');

Export.image.toDrive({
  image: demLargeV2,
  description: 'sidi_bou_said_dem_v3',
  region: largerAoiV2Geom,
  scale: 30,
  crs: 'EPSG:32632',
  maxPixels: 1e9
});



// ============================================================
// CHIRPS daily rainfall time series — Sidi Bou Said
// Extracts daily precipitation for antecedent-rainfall analysis
// around Storm Harry (~late Jan 2026)
// ============================================================

var aoi = ee.FeatureCollection("projects/tp1-geomatics/assets/AOI");
var aoiGeom = aoi.geometry();

// Pull a long enough window to compute 30-day antecedent totals well
// before the storm, plus the storm period itself and some after
var startDate = '2025-11-01';
var endDate = '2026-02-15';

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate(startDate, endDate)
  .filterBounds(aoiGeom);

print('CHIRPS image count:', chirps.size());

// ---- Extract mean daily precipitation over the AOI as a time series ----
var dailySeries = chirps.map(function(image) {
  var meanPrecip = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoiGeom,
    scale: 5000,  // CHIRPS native resolution is ~5.5km, no point going finer
    maxPixels: 1e9
  });
  return ee.Feature(null, {
    'date': image.date().format('YYYY-MM-dd'),
    'precip_mm': meanPrecip.get('precipitation')
  });
});

var dailyFC = ee.FeatureCollection(dailySeries);

// ---- Chart it for a quick visual check ----
var chart = ui.Chart.feature.byFeature(dailyFC, 'date', 'precip_mm')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Daily rainfall — Sidi Bou Said (CHIRPS)',
    hAxis: {title: 'Date'},
    vAxis: {title: 'Precipitation (mm)'}
  });
print(chart);

// ---- Export as CSV for the antecedent-window analysis in Python ----
Export.table.toDrive({
  collection: dailyFC,
  description: 'sidi_bou_said_chirps_daily',
  fileFormat: 'CSV'
});

