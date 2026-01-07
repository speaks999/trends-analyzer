declare module 'google-trends-api' {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface InterestByRegionOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    resolution?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface RelatedQueriesOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface GoogleTrends {
    interestOverTime(options: InterestOverTimeOptions): Promise<string>;
    interestByRegion(options: InterestByRegionOptions): Promise<string>;
    relatedQueries(options: RelatedQueriesOptions): Promise<string>;
    relatedTopics(options: RelatedQueriesOptions): Promise<string>;
    dailyTrends(options: { geo: string; trendDate?: Date }): Promise<string>;
    realTimeTrends(options: { geo: string; category?: string }): Promise<string>;
  }

  const googleTrends: GoogleTrends;
  export default googleTrends;
}

