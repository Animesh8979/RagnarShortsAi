export declare class CoreMemory {
    private transport;
    private client;
    init(): Promise<void>;
    store(key: string, value: string, tags?: string[]): Promise<void>;
    retrieve(key: string): Promise<string | null>;
    search(query: string, limit?: number): Promise<any[]>;
    rememberInteraction(prompt: string, response: string): Promise<void>;
    recallRelevant(query: string): Promise<any[]>;
    close(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map