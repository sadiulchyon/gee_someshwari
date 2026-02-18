// =====================================================
// GEE SCRIPT: Someshwari River — Dry Season LULC Training
// Training image: 2023-03-02 (single date, 0% cloud, WL=7.250m)
// Classes: 1=Vegetation, 2=Water, 3=Sand
// Purpose: Address sand↔vegetation misclassification in dry season
//          caused by previous Oct–Dec training data being seasonally
//          unrepresentative of dry-season spectral conditions.
//
// INSTRUCTIONS:
//   1. Run script to load image and index layers.
//   2. Use the GEE drawing tool (top-left of map) to digitize polygons.
//      Draw polygons for each class, assign the 'class' property:
//        Vegetation = 1  (all vegetation — green, dry, sparse, dense)
//        Water      = 2
//        Sand       = 3  (include both bright dry sand AND damp bar margins)
//   3. Name your geometry imports: 'vegetation', 'water', 'sand'
//      (the script references these variable names).
//   4. After digitizing, run the Training & Export section.
//   5. Confirm asset export jobs in the Tasks tab.
// =====================================================


// =====================================================
// SECTION 1: CONFIGURATION
// =====================================================

var aoiFC = ee.FeatureCollection('projects/riversand2024/assets/someshwari/aoi');
var aoi = aoiFC.geometry();
Map.centerObject(aoi, 12);

// Single dry-season image — 2023-03-02
// 0% cloud cover, WL=7.250m, stable baseflow
// Same image used as noise floor calibration in Layer D
var targetDate = '2023-03-02';
var searchWindow = 1;  // ±1 day — forces retrieval of exactly this date


// =====================================================
// SECTION 2: IMAGE PROCESSING FUNCTIONS
// =====================================================

function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask  = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask)
    .divide(10000)
    .copyProperties(image, ['system:time_start']);
}

function selectBands(image) {
  return image.select(['B4', 'B3', 'B2', 'B8', 'B11', 'B12']);
}

function addIndices(image) {
  var ndvi = image.expression(
    '(NIR - RED) / (NIR + RED)',
    {'NIR': image.select('B8'), 'RED': image.select('B4')}
  ).rename('NDVI');

  var ndbi = image.expression(
    '(SWIR - NIR) / (SWIR + NIR)',
    {'NIR': image.select('B8'), 'SWIR': image.select('B11')}
  ).rename('NDBI');

  var mndwi = image.expression(
    '(GREEN - SWIR1) / (GREEN + SWIR1)',
    {'GREEN': image.select('B3'), 'SWIR1': image.select('B11')}
  ).rename('MNDWI');

  var ndsli = image.expression(
    '(RED - SWIR1) / (RED + SWIR1)',
    {'RED': image.select('B4'), 'SWIR1': image.select('B11')}
  ).rename('NDSLI');

  return image.addBands([ndvi, ndbi, mndwi, ndsli]);
}


// =====================================================
// SECTION 3: LOAD TARGET IMAGE
// =====================================================

var t = ee.Date(targetDate);
var s2Collection = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(t.advance(-searchWindow, 'day'), t.advance(searchWindow, 'day'))
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5))
  .map(maskS2clouds)
  .map(function(img) { return img.clip(aoi); })
  .map(selectBands);

// Use .first() — single image retrieval, not composite
var trainingImage = s2Collection.first();
var trainingImageWithIndices = addIndices(trainingImage);

// Verify correct image loaded
print('═══════════════════════════════════════════════');
print('DRY SEASON TRAINING IMAGE');
print('Target date: ' + targetDate);
print('Band names:', trainingImageWithIndices.bandNames());

var imgDate = ee.Date(trainingImage.get('system:time_start'));
print('Actual image date:', imgDate.format('YYYY-MM-dd'));
print('Scene cloud %:', trainingImage.get('CLOUDY_PIXEL_PERCENTAGE'));
print('═══════════════════════════════════════════════');


// =====================================================
// SECTION 4: MAP LAYERS FOR DIGITIZING
// =====================================================

// Add multiple index visualizations to help distinguish
// dry vegetation from sand during digitizing

var rgbViz   = {min: 0, max: 0.3,  bands: ['B4', 'B3', 'B2']};
var nirViz   = {min: 0, max: 0.5,  bands: ['B8', 'B4', 'B3']};  // NIR false color — veg = red
var swirViz  = {min: 0, max: 0.5,  bands: ['B11', 'B8', 'B4']}; // SWIR false color — sand = bright

var ndviViz  = {min: -0.2, max: 0.5, palette: ['d73027','ffffbf','1a9850']};
var mndwiViz = {min: -0.5, max: 0.5, palette: ['d73027','ffffbf','2389da']};
var ndsliViz = {min: -0.3, max: 0.5, palette: ['2389da','ffffbf','C2B280']};

Map.addLayer(trainingImageWithIndices, rgbViz,   '① RGB True Color (start here)',    true);
Map.addLayer(trainingImageWithIndices, nirViz,   '② NIR False Color (veg=red)',       false);
Map.addLayer(trainingImageWithIndices, swirViz,  '③ SWIR False Color (sand=bright)',  false);
Map.addLayer(trainingImageWithIndices.select('NDVI'),  ndviViz,  '④ NDVI  (veg=green, sand=yellow/red)', false);
Map.addLayer(trainingImageWithIndices.select('MNDWI'), mndwiViz, '⑤ MNDWI (water=blue, dry=red)',        false);
Map.addLayer(trainingImageWithIndices.select('NDSLI'), ndsliViz, '⑥ NDSLI (sand=tan, water=blue)',       false);
Map.addLayer(aoi, {color: 'white'}, 'AOI boundary', false);

print('');
print('MAP LAYERS LOADED. Use ④ NDVI and ③ SWIR to guide digitizing:');
print('  Sand:       NDVI < 0.10, NDSLI > 0.10, SWIR bright');
print('  Dry veg:    NDVI 0.10–0.25, brownish in RGB');
print('  Green veg:  NDVI > 0.25, red in NIR false color');
print('  → Classify ALL vegetation as class 1 regardless of greenness');
print('  → For sand, include BOTH bright dry bars AND darker damp margins');
print('');


// =====================================================
// SECTION 5: TRAINING DATA PREPARATION
// =====================================================
// This section runs after you have digitized polygons.
// Your geometry imports must be named: vegetation, water, sand
// Each must have a 'class' property set to 1, 2, 3 respectively.
// In GEE drawing tool: after drawing, click the geometry import
// and add property: class = [1 / 2 / 3]

// Merge and split
var trainingPolygons = vegetation
  .merge(water)
  .merge(sand);

trainingPolygons = trainingPolygons.randomColumn('random', 42);

var trainPolygons = trainingPolygons.filter(ee.Filter.lte('random', 0.8));
var testPolygons  = trainingPolygons.filter(ee.Filter.gt('random',  0.8));

print('═══════════════════════════════════════════════');
print('TRAINING POLYGON COUNTS');
print('Total polygons:', trainingPolygons.size());
print('Train (80%):', trainPolygons.size());
print('Test  (20%):', testPolygons.size());
print('═══════════════════════════════════════════════');


// =====================================================
// SECTION 6: SPECTRAL SAMPLING
// =====================================================

var inputBands = ['B4', 'B3', 'B2', 'B8', 'B11', 'B12',
                  'NDVI', 'NDBI', 'MNDWI', 'NDSLI'];

var trainSamples = trainingImageWithIndices.sampleRegions({
  collection: trainPolygons,
  scale: 10,
  properties: ['class'],
  geometries: true
});

var testSamples = trainingImageWithIndices.sampleRegions({
  collection: testPolygons,
  scale: 10,
  properties: ['class'],
  geometries: true
});

print('Train spectral samples:', trainSamples.size());
print('Test  spectral samples:', testSamples.size());
print('Sample structure:', trainSamples.first());


// =====================================================
// SECTION 7: RANDOM FOREST CLASSIFICATION
// =====================================================

var rfClassifier = ee.Classifier.smileRandomForest(100)
  .train(trainSamples, 'class', inputBands);

// Accuracy assessment
var confusionMatrix = testSamples
  .classify(rfClassifier, 'predict')
  .errorMatrix('class', 'predict');

print('═══════════════════════════════════════════════');
print('ACCURACY ASSESSMENT (dry-season classifier)');
print('Confusion Matrix:', confusionMatrix);
print('Overall Accuracy:', confusionMatrix.accuracy());
print('Kappa Coefficient:', confusionMatrix.kappa());
print('Producers Accuracy:', confusionMatrix.producersAccuracy());
print('Consumers Accuracy:', confusionMatrix.consumersAccuracy());
print('═══════════════════════════════════════════════');

// Apply classifier to training image as a visual check
var lulcClassified = trainingImageWithIndices
  .classify(rfClassifier, 'LULC')
  .toByte()
  .set({
    'LULC_class_values':  [1, 2, 3],
    'LULC_class_palette': ['416422', '2389da', 'C2B280'],
    'training_date': targetDate,
    'classifier': 'RandomForest_100trees',
    'training_season': 'dry_season_Mar2023'
  });

var lulcViz = {min: 1, max: 3, palette: ['416422', '2389da', 'C2B280']};
Map.addLayer(lulcClassified, lulcViz, '⑦ LULC Classification — check visually', false);

// Area statistics on training image
var pixelArea = ee.Image.pixelArea();
var vegArea   = lulcClassified.eq(1).multiply(pixelArea)
  .reduceRegion({reducer: ee.Reducer.sum(), geometry: aoi, scale: 10, maxPixels: 1e13});
var watArea   = lulcClassified.eq(2).multiply(pixelArea)
  .reduceRegion({reducer: ee.Reducer.sum(), geometry: aoi, scale: 10, maxPixels: 1e13});
var sndArea   = lulcClassified.eq(3).multiply(pixelArea)
  .reduceRegion({reducer: ee.Reducer.sum(), geometry: aoi, scale: 10, maxPixels: 1e13});

vegArea.get('LULC').evaluate(function(a) {
  print('Vegetation area: ' + (a/1e6).toFixed(3) + ' km²'); });
watArea.get('LULC').evaluate(function(a) {
  print('Water area:      ' + (a/1e6).toFixed(3) + ' km²'); });
sndArea.get('LULC').evaluate(function(a) {
  print('Sand area:       ' + (a/1e6).toFixed(3) + ' km²'); });


// =====================================================
// SECTION 8: NDVI DISTRIBUTION CHECK
// =====================================================
// Prints NDVI mean per class — helps verify sand/veg boundary
// Sand NDVI should be clearly below vegetation NDVI in dry season

var classNames = {1: 'Vegetation', 2: 'Water', 3: 'Sand'};
[1, 2, 3].forEach(function(cls) {
  var mask = lulcClassified.eq(cls);
  var ndviMean = trainingImageWithIndices.select('NDVI')
    .updateMask(mask)
    .reduceRegion({reducer: ee.Reducer.mean(), geometry: aoi, scale: 10, maxPixels: 1e13});
  ndviMean.get('NDVI').evaluate(function(v) {
    print('Mean NDVI — ' + classNames[cls] + ': ' + (Math.round(v*1000)/1000));
  });
});


// =====================================================
// SECTION 9: EXPORT TO ASSETS
// =====================================================
// Run these exports after visually confirming classification looks correct.
// Check the Tasks tab → click Run for each task.

// 9.1 — Raw training polygons (geometry + class attribute)
Export.table.toAsset({
  collection: trainingPolygons,
  description: 'training_polygons_dry_Mar2023',
  assetId: 'projects/riversand2024/assets/someshwari/training_polygons_dry_Mar2023'
});

// 9.2 — Spectral samples used for training (80%)
Export.table.toAsset({
  collection: trainSamples,
  description: 'training_spectral_samples_dry_Mar2023',
  assetId: 'projects/riversand2024/assets/someshwari/training_spectral_samples_dry_Mar2023'
});

// 9.3 — Spectral samples used for testing (20%)
Export.table.toAsset({
  collection: testSamples,
  description: 'test_spectral_samples_dry_Mar2023',
  assetId: 'projects/riversand2024/assets/someshwari/test_spectral_samples_dry_Mar2023'
});

// 9.4 — Classified image of training date (visual QC record)
Export.image.toDrive({
  image: lulcClassified,
  description: 'LULC_dry_2023-03-02_training_check',
  folder: 'SandMining_Training',
  fileNamePrefix: 'LULC_dry_2023-03-02',
  region: aoi,
  scale: 10,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

print('');
print('═══════════════════════════════════════════════');
print('EXPORT TASKS QUEUED (check Tasks tab → Run):');
print('  Asset 1: training_polygons_dry_Mar2023');
print('  Asset 2: training_spectral_samples_dry_Mar2023');
print('  Asset 3: test_spectral_samples_dry_Mar2023');
print('  Drive:   LULC_dry_2023-03-02 (visual QC)');
print('═══════════════════════════════════════════════');


// =====================================================
// SECTION 10: UI PANELS
// =====================================================

// Legend
var legendPanel = ui.Panel({
  style: {position: 'bottom-left', padding: '10px 15px', backgroundColor: 'white'}
});
legendPanel.add(ui.Label('LULC — Dry Season Training', {fontWeight: 'bold', fontSize: '14px'}));
legendPanel.add(ui.Label('Image: ' + targetDate + '  |  WL=7.250m  |  0% cloud',
  {fontSize: '11px', color: '#666', margin: '0 0 8px 0'}));

[['416422', 'Vegetation (class 1)'],
 ['2389da', 'Water (class 2)'],
 ['C2B280', 'Sand (class 3)']]
  .forEach(function(item) {
    legendPanel.add(ui.Panel([
      ui.Label('', {backgroundColor: '#' + item[0], padding: '8px', margin: '2px 6px 2px 0'}),
      ui.Label(item[1], {fontSize: '12px', margin: '2px 0'})
    ], ui.Panel.Layout.flow('horizontal')));
  });
Map.add(legendPanel);

// Accuracy panel (populated after classifier runs)
var accPanel = ui.Panel({
  style: {position: 'top-right', padding: '10px 15px', backgroundColor: 'white'}
});
accPanel.add(ui.Label('Dry Season Classifier Accuracy',
  {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}));

confusionMatrix.accuracy().evaluate(function(oa) {
  accPanel.add(ui.Label('Overall Accuracy: ' + (oa * 100).toFixed(2) + '%', {fontSize: '13px'}));
});
confusionMatrix.kappa().evaluate(function(k) {
  accPanel.add(ui.Label('Kappa: ' + k.toFixed(4), {fontSize: '13px'}));
});
testSamples.size().evaluate(function(n) {
  accPanel.add(ui.Label('Test samples: ' + n, {fontSize: '12px', color: '#666', margin: '6px 0 0 0'}));
});
Map.add(accPanel);

// Digitizing guide panel
var guidePanel = ui.Panel({
  style: {position: 'top-left', padding: '10px 14px',
          backgroundColor: 'white', width: '300px'}
});
guidePanel.add(ui.Label('DIGITIZING GUIDE', {fontWeight: 'bold', fontSize: '13px'}));
guidePanel.add(ui.Label(
  '1. Draw polygons using the toolbar above\n' +
  '2. Set property: class = 1 (Veg), 2 (Water), 3 (Sand)\n' +
  '3. Use SWIR / NDVI layers to guide decisions\n\n' +
  'SAND tips:\n' +
  '  • Include bright dry bars (easy)\n' +
  '  • Include darker damp bar margins (critical)\n' +
  '  • NDVI typically < 0.10\n\n' +
  'VEG tips:\n' +
  '  • Include both green and dry/brown veg\n' +
  '  • NDVI typically 0.10–0.50\n' +
  '  • Brownish-tan riparian shrubs are veg',
  {fontSize: '11px', whiteSpace: 'pre', color: '#333'}
));
Map.add(guidePanel);


// =====================================================
// END OF SCRIPT
// =====================================================
