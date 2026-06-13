import 'hono'

declare module 'hono'{
    interface ContextVariableMap{
        tenantId: string;
        tenantName: string;
        tenantSettings:{
            riskThreshold: number;
            failOpen: boolean;
        };
        requestId: string;
        userId: string;
    }
}