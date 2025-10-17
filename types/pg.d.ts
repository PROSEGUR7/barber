declare module "pg" {
  import { EventEmitter } from "events"

  export interface PoolConfig {
    connectionString?: string
    ssl?: any
  }

  export interface QueryResult<T> {
    rowCount: number
    rows: T[]
  }

  export interface PoolClient {
    query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>
    release(err?: Error): void
  }

  export class Pool extends EventEmitter {
    constructor(config?: PoolConfig)
    query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>
    connect(): Promise<PoolClient>
    end(): Promise<void>
  }

  export function native(overrides?: any): any
}
