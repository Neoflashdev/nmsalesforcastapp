const fs = require('fs');
const path = require('path');

// Load model trees and metadata
const modelTrees = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/services/model.json'), 'utf8'));
const modelMetadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/services/model_metadata.json'), 'utf8'));

// Load generated Python test samples
const testCases = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_samples.json'), 'utf8'));

/**
 * Traverses a single decision tree to find the prediction leaf score.
 */
function predictTree(node, features) {
  if (node.leaf !== undefined) {
    return node.leaf;
  }

  const featureName = node.split;
  const val = features[featureName];

  // If feature is missing, go to the default 'missing' branch
  if (val === undefined || val === null || isNaN(val)) {
    const nextNodeId = node.missing !== undefined ? node.missing : node.yes;
    const child = node.children.find((c) => c.nodeid === nextNodeId);
    if (!child) return 0;
    return predictTree(child, features);
  }

  if (val < node.split_condition) {
    const child = node.children.find((c) => c.nodeid === node.yes);
    if (!child) return 0;
    return predictTree(child, features);
  } else {
    const child = node.children.find((c) => c.nodeid === node.no);
    if (!child) return 0;
    return predictTree(child, features);
  }
}

/**
 * Predicts output across all trees in the booster
 */
function predictXGBoost(rawFeatures) {
  let score = modelMetadata.base_score;
  for (const tree of modelTrees) {
    score += predictTree(tree, rawFeatures);
  }
  return score;
}

// Run verification
console.log('--- Running XGBoost JS Predictor Verification ---');
let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const rawFeatures = testCase.features;
  const pyRawPrediction = testCase.python_raw_prediction;
  const pyClippedPrediction = testCase.python_prediction;

  const jsRawPrediction = predictXGBoost(rawFeatures);
  const jsClippedPrediction = Math.max(0, jsRawPrediction);

  // Compute absolute error
  const rawDiff = Math.abs(jsRawPrediction - pyRawPrediction);
  const clippedDiff = Math.abs(jsClippedPrediction - pyClippedPrediction);

  console.log(`\nTest Case ${testCase.id}:`);
  console.log(`  Python Raw Pred:    ${pyRawPrediction.toFixed(6)}`);
  console.log(`  JS Raw Pred:        ${jsRawPrediction.toFixed(6)}`);
  console.log(`  Raw Difference:     ${rawDiff.toFixed(6)}`);
  console.log(`  Python Clipped Pred: ${pyClippedPrediction.toFixed(6)}`);
  console.log(`  JS Clipped Pred:     ${jsClippedPrediction.toFixed(6)}`);

  // Allow a very small tolerance for float representation differences (e.g. 1e-5)
  if (rawDiff < 1e-4 && clippedDiff < 1e-4) {
    console.log('  Status: ✅ PASSED');
    passed++;
  } else {
    console.log('  Status: ❌ FAILED');
    failed++;
  }
}

console.log(`\nVerification Summary: ${passed} Passed, ${failed} Failed`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
