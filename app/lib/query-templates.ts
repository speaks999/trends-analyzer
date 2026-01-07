// Query template system for generating entrepreneurial search queries

export type QueryTemplate = 
  | 'how to get {result}'
  | 'how to fix {problem}'
  | 'best way to manage {thing}'
  | 'software for {job}'
  | 'why is {metric} low'
  | 'how to exit {business_type}';

export type Stage = 'idea' | 'early-stage' | 'growth' | 'scaling' | 'exit';
export type Function = 'sales' | 'marketing' | 'finance' | 'operations' | 'hiring' | 'leadership';
export type Pain = 'cash flow' | 'customer acquisition' | 'churn' | 'follow-up' | 'delegation' | 'burnout';
export type Asset = 'CRM' | 'dashboard' | 'spreadsheet' | 'automation' | 'AI assistant';

export const STAGES: Stage[] = ['idea', 'early-stage', 'growth', 'scaling', 'exit'];
export const FUNCTIONS: Function[] = ['sales', 'marketing', 'finance', 'operations', 'hiring', 'leadership'];
export const PAINS: Pain[] = ['cash flow', 'customer acquisition', 'churn', 'follow-up', 'delegation', 'burnout'];
export const ASSETS: Asset[] = ['CRM', 'dashboard', 'spreadsheet', 'automation', 'AI assistant'];

export interface QueryMetadata {
  template: QueryTemplate;
  stage?: Stage;
  function?: Function;
  pain?: Pain;
  asset?: Asset;
}

export interface GeneratedQuery {
  text: string;
  metadata: QueryMetadata;
}

/**
 * Expand a template with a value
 */
function expandTemplate(template: QueryTemplate, value: string): string {
  return template.replace(/\{result\}|\{problem\}|\{thing\}|\{job\}|\{metric\}|\{business_type\}/, value);
}

/**
 * Generate queries from templates using expansion dimensions
 */
export function generateQueriesFromTemplates(
  templates: QueryTemplate[] = [
    'how to get {result}',
    'how to fix {problem}',
    'best way to manage {thing}',
    'software for {job}',
    'why is {metric} low',
    'how to exit {business_type}',
  ],
  options: {
    includeStages?: boolean;
    includeFunctions?: boolean;
    includePains?: boolean;
    includeAssets?: boolean;
    maxQueries?: number;
  } = {}
): GeneratedQuery[] {
  const {
    includeStages = true,
    includeFunctions = true,
    includePains = true,
    includeAssets = true,
    maxQueries = 50,
  } = options;

  const queries: GeneratedQuery[] = [];

  for (const template of templates) {
    // Generate queries based on template type
    if (template.includes('{result}')) {
      if (includeStages) {
        for (const stage of STAGES) {
          queries.push({
            text: expandTemplate(template, stage === 'early-stage' ? 'first customers' : `${stage} funding`),
            metadata: { template, stage },
          });
        }
      }
      if (includeFunctions) {
        for (const func of FUNCTIONS) {
          queries.push({
            text: expandTemplate(template, `${func} leads`),
            metadata: { template, function: func },
          });
        }
      }
    } else if (template.includes('{problem}')) {
      if (includePains) {
        for (const pain of PAINS) {
          queries.push({
            text: expandTemplate(template, pain),
            metadata: { template, pain },
          });
        }
      }
    } else if (template.includes('{thing}')) {
      if (includeFunctions) {
        for (const func of FUNCTIONS) {
          queries.push({
            text: expandTemplate(template, func),
            metadata: { template, function: func },
          });
        }
      }
    } else if (template.includes('{job}')) {
      if (includeFunctions) {
        for (const func of FUNCTIONS) {
          queries.push({
            text: expandTemplate(template, func),
            metadata: { template, function: func },
          });
        }
      }
    } else if (template.includes('{metric}')) {
      const metrics = ['revenue', 'growth', 'conversion', 'retention', 'engagement'];
      for (const metric of metrics) {
        queries.push({
          text: expandTemplate(template, metric),
          metadata: { template },
        });
      }
    } else if (template.includes('{business_type}')) {
      const businessTypes = ['SaaS', 'e-commerce', 'consulting', 'agency', 'marketplace'];
      for (const type of businessTypes) {
        queries.push({
          text: expandTemplate(template, type),
          metadata: { template },
        });
      }
    }
  }

  // Limit results if specified
  return queries.slice(0, maxQueries);
}

/**
 * Get all available templates
 */
export function getAvailableTemplates(): QueryTemplate[] {
  return [
    'how to get {result}',
    'how to fix {problem}',
    'best way to manage {thing}',
    'software for {job}',
    'why is {metric} low',
    'how to exit {business_type}',
  ];
}

/**
 * Get expansion dimensions
 */
export function getExpansionDimensions() {
  return {
    stages: STAGES,
    functions: FUNCTIONS,
    pains: PAINS,
    assets: ASSETS,
  };
}

