export declare class CoreResearch {
    private transport;
    private client;
    private braveSearch?;
    private tavilySearch?;
    init(): Promise<void>;
    searchBrave(query: string, count?: number): Promise<any[]>;
    searchTavily(query: string, count?: number): Promise<any[]>;
    fetchPage(url: string): Promise<string>;
    thinkSequentially(problem: string): Promise<string>;
    private ensureConnected;
    close(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map