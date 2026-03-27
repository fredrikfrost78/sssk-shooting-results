export {}

type ServerConfig = {
    resultsDir?: string
    enableScrolling: boolean
    competitionName?: string
    sheetName?: string
    sheetIndex?: number
    columns: {
        klass: string
        namn: string
        klubb: string
        series: string[]
        antalX: string
        summa: string
    }
}

type LoadResultsResponse = {
    config: ServerConfig
    rows: unknown[]
}

type ApiBridge = {
    getConfig: () => Promise<ServerConfig>
    loadResults: () => Promise<LoadResultsResponse>
    onResultsChanged: (callback: () => void) => () => void
    saveConfig: (nextConfig: unknown) => Promise<unknown>
    chooseResultsDir: () => Promise<unknown>
}

declare global {
    interface Window {
        api: ApiBridge
    }

    var api: ApiBridge
}