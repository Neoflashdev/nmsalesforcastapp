import localModelTrees from './model.json';
import localModelMetadata from './model_metadata.json';

export interface TreeNode {
  nodeid: number;
  depth: number;
  split?: string;
  split_condition?: number;
  yes?: number;
  no?: number;
  missing?: number;
  leaf?: number;
  children?: TreeNode[];
}

export interface ModelMetadata {
  features: string[];
  base_score: number;
  item_encodings: Record<string, number>;
  route_encodings: Record<string, number>;
  global_averages: {
    item_encoding_fallback: number;
    route_encoding_fallback: number;
    route_avg_all_fallback: number;
  };
}

// In-memory active model (defaulting to local fallback trees)
let activeModelTrees: TreeNode[] = localModelTrees as any;
let activeModelMetadata: ModelMetadata = localModelMetadata as any;

const MODEL_URL = 'https://fnelwyjugldtwtokjysj.supabase.co/storage/v1/object/public/ai-models/model.json';
const METADATA_URL = 'https://fnelwyjugldtwtokjysj.supabase.co/storage/v1/object/public/ai-models/model_metadata.json';

/**
 * Dynamically fetches the latest model files from Supabase Storage.
 * Falls back to local model files if request fails or device is offline.
 */
export async function loadModelDynamically(): Promise<boolean> {
  try {
    console.log("Fetching live XGBoost model from Supabase Storage...");

    // Fetch with a 6-second timeout to avoid holding up the app boot
    const fetchWithTimeout = (url: string, timeoutMs = 6000) => {
      return Promise.race([
        fetch(url),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Network request timeout")), timeoutMs)
        ),
      ]);
    };

    const [modelRes, metadataRes] = await Promise.all([
      fetchWithTimeout(MODEL_URL),
      fetchWithTimeout(METADATA_URL),
    ]);

    if (!modelRes.ok || !metadataRes.ok) {
      throw new Error(`Model files not found (Status: ${modelRes.status} / ${metadataRes.status})`);
    }

    const trees = await modelRes.json();
    const meta = await metadataRes.json();

    if (Array.isArray(trees) && meta && meta.base_score !== undefined) {
      activeModelTrees = trees;
      activeModelMetadata = meta;
      console.log("Successfully loaded live XGBoost model!");
      return true;
    } else {
      throw new Error("Invalid model file structure received");
    }
  } catch (error) {
    console.warn("Could not load dynamic model from Supabase Storage. Falling back to local model.", error);
    return false;
  }
}

/**
 * Traverses a single decision tree to find the prediction leaf score.
 */
function predictTree(node: TreeNode, features: Record<string, number>): number {
  if (node.leaf !== undefined) {
    return node.leaf;
  }

  const featureName = node.split!;
  const val = features[featureName];

  // If feature is missing, go to the default 'missing' branch
  if (val === undefined || val === null || isNaN(val)) {
    const nextNodeId = node.missing !== undefined ? node.missing : node.yes!;
    const child = node.children?.find((c) => c.nodeid === nextNodeId);
    if (!child) return 0;
    return predictTree(child, features);
  }

  if (val < node.split_condition!) {
    const child = node.children?.find((c) => c.nodeid === node.yes!);
    if (!child) return 0;
    return predictTree(child, features);
  } else {
    const child = node.children?.find((c) => c.nodeid === node.no!);
    if (!child) return 0;
    return predictTree(child, features);
  }
}

export interface ForecastInput {
  productId: string;
  routeId: string;
  last7: number;
  last30: number;
  last90: number;
  routeAvgAll: number;
  routeItemAvg: number;
  monthlyAvg: number;
  overallAvgMonthly: number;
  growthRate: number;
  frequency: number;
  customerCoverage: number;
  daysSinceLastSale: number;
  seasonalIndex: number;
}

/**
 * Generates XGBoost demand forecast for a given Product-Route combination.
 */
export function predictXGBoostDemand(input: ForecastInput, targetMonthDate: Date = new Date()): number {
  const metadata = activeModelMetadata;
  const trees = activeModelTrees;

  // 1. Target Encoding for Item and Route IDs
  const itemIdEncoded = metadata.item_encodings[input.productId] !== undefined
    ? metadata.item_encodings[input.productId]
    : metadata.global_averages.item_encoding_fallback;

  const routeIdEncoded = metadata.route_encodings[input.routeId] !== undefined
    ? metadata.route_encodings[input.routeId]
    : metadata.global_averages.route_encoding_fallback;

  // 2. Cyclical month features
  const monthVal = targetMonthDate.getMonth() + 1; // 1 to 12
  const monthSin = Math.sin((2 * Math.PI * monthVal) / 12);
  const monthCos = Math.cos((2 * Math.PI * monthVal) / 12);

  // 3. Assemble features list matching Python order
  const features: Record<string, number> = {
    item_id_encoded: itemIdEncoded,
    route_id_encoded: routeIdEncoded,
    month_sin: monthSin,
    month_cos: monthCos,
    last7: input.last7,
    last30: input.last30,
    last90: input.last90,
    route_avg_all: input.routeAvgAll !== 0 ? input.routeAvgAll : metadata.global_averages.route_avg_all_fallback,
    route_item_avg: input.routeItemAvg,
    monthly_avg: input.monthlyAvg,
    overall_avg_monthly: input.overallAvgMonthly,
    growth_rate: input.growthRate,
    frequency: input.frequency,
    customer_coverage: input.customerCoverage,
    days_since_last_sale: input.daysSinceLastSale,
    seasonal_index: input.seasonalIndex,
  };

  // 4. Score summation across all trees
  let score = metadata.base_score;
  for (const tree of trees) {
    score += predictTree(tree, features);
  }

  // 5. Post-process (clip predictions at 0, since sales quantity cannot be negative)
  return Math.max(0, score);
}
