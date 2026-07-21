interface ThoughtStep {
    thought: string;
    conclusion: string;
    confidence: number;
}
export declare class CoreThinking {
    private transport;
    private client;
    init(): Promise<void>;
    decompose(problem: string): Promise<ThoughtStep[]>;
    reason(problem: string): Promise<string>;
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=index.d.ts.map