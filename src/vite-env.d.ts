export {}

declare global {
    interface Window {
        api: {
            getConfig: () => Promise<{
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
            }>
            loadResults: () => Promise<{
                config: unknown
                rows: unknown[]
            }>
            onResultsChanged: (callback: () => void) => () => void
            saveConfig: (nextConfig: unknown) => Promise<unknown>
            chooseResultsDir: () => Promise<unknown>
        }
    }
}