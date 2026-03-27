import {type ReactElement, useEffect, useMemo, useRef, useState} from 'react'
import './ShootingResultsTV.css'

type ResultRow = {
    klass: string
    namn: string
    klubb: string
    series: number[]
    x: number
    summa: number
}

type ServerConfig = {
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

//default setup
const defaultServerConfig: ServerConfig = {
    enableScrolling: true,
    competitionName: 'Resultat',
    sheetName: 'Resultat',
    sheetIndex: 0,
    columns: {
        klass: 'Klass',
        namn: 'Namn',
        klubb: 'Klubb',
        series: ['Serie1', 'Serie2', 'Serie3', 'Serie4', 'Serie5', 'Serie6', 'Serie7'],
        antalX: 'X',
        summa: 'Summa',
    },
}

type LoadResultsResponse = {
    config: ServerConfig
    rows: ResultRow[]
}

const config = {
    pollingIntervalMs: 5000,
}

type GroupedResults = Record<string, ResultRow[]>

//group an sort the rows by shooting-class and then by score and name
const groupAndSort = (rows: ResultRow[]): GroupedResults => {
    const grouped: GroupedResults = {}

    for (const row of rows) {
        if (!row.klass || !row.namn || row.namn.trim() === '') {
            continue
        }
        const normalizedKlass = row.klass.trim().toUpperCase()

        if (!grouped[normalizedKlass]) {
            grouped[normalizedKlass] = []
        }
        grouped[normalizedKlass].push(row)
    }

    for (const klass of Object.keys(grouped)) {
        grouped[klass].sort((a, b) => {
            // 1. Sort by total score (summa)
            if (b.summa !== a.summa) {
                return b.summa - a.summa
            }

            // 2. Then by number of X (antal kryss)
            if (b.x !== a.x) {
                return b.x - a.x
            }

            // 3. Finally by name
            return a.namn.localeCompare(b.namn, 'sv')
        })
    }

    return Object.fromEntries(
        Object.entries(grouped).sort(([a], [b]) =>
            a.toUpperCase().localeCompare(b.toUpperCase(), 'sv'),
        ),
    )
}

export default function ShootingResultsTV(): ReactElement {
    const [rows, setRows] = useState<ResultRow[]>([])
    const scrollContainerRef = useRef<HTMLDivElement | null>(null)
    const [serverConfig, setServerConfig] = useState<ServerConfig>(defaultServerConfig)
    const groupedResults = useMemo(() => groupAndSort(rows), [rows])

    //render sections
    const renderSections = (): ReactElement[] =>
        Object.entries(groupedResults).map(([klass, resultRows], groupIndex) => (
            <section key={`${klass}-${groupIndex}`} className="section">
                <h2 className="class-title">Klass {klass}</h2>

                <table className="results-table">
                    <thead>
                    <tr>
                        <th className="results-header-cell">Placering</th>
                        <th className="results-header-cell">Namn</th>
                        <th className="results-header-cell name-column">Klubb</th>
                        {serverConfig.columns.series.map((series, index) => (
                            <th key={series} className="results-header-cell">
                                Serie {index + 1}
                            </th>
                        ))}
                        <th className="results-header-cell">Antal X</th>
                        <th className="results-header-cell">Summa</th>
                    </tr>
                    </thead>
                    <tbody>
                    {[
                        ...resultRows,
                        ...new Array(1).fill(null)
                    ].map((row, index) =>
                        row ? (
                            <tr key={`${klass}-${row.namn}-${index}`} className="results-row">
                                <td className="results-cell">{index + 1}</td>
                                <td className="results-cell">{row.namn}</td>
                                <td className="results-cell">{row.klubb}</td>
                                {row.series.map((value: string, _: number) => (
                                    <td key={value} className="results-cell">{value}</td>
                                ))}
                                <td className="results-cell">{row.x}</td>
                                <td className="results-cell total-cell">{row.summa}</td>
                            </tr>
                        ) : (
                            <tr key={`empty-${klass}-${index}`} className="results-row">
                                <td
                                    colSpan={serverConfig.columns.series.length + 5}
                                    className="results-cell empty-row-cell"
                                >
                                    &nbsp;
                                </td>
                            </tr>
                        )
                    )}
                    </tbody>
                </table>
            </section>
        ))

    useEffect(() => {
        //load the results from the server
        const load = async (): Promise<void> => {
            try {
                const result = (await globalThis.api.loadResults()) as LoadResultsResponse

                setServerConfig({
                    enableScrolling: result.config.enableScrolling ?? defaultServerConfig.enableScrolling,
                    competitionName: result.config.competitionName ?? defaultServerConfig.competitionName,
                    columns: result.config.columns ?? defaultServerConfig.columns,
                })

                setRows(result.rows)
            } catch (error) {
                console.error('Fel vid inläsning av resultatfil:', error)
            }
        }

        void load()

        const unsubscribe = globalThis.api.onResultsChanged(() => {
            void load()
        })

        const interval = globalThis.setInterval(() => {
            void load()
        }, config.pollingIntervalMs)

        return () => {
            unsubscribe()
            globalThis.clearInterval(interval)
        }
    }, [])

    //update by serverconfig
    useEffect(() => {
        const container = scrollContainerRef.current
        if (!serverConfig.enableScrolling || !container || rows.length === 0) {
            return
        }

        let paused = false

        const interval = globalThis.setInterval(() => {
            if (paused) {
                return
            }

            const maxScrollTop = container.scrollHeight - container.clientHeight

            if (container.scrollTop + 1 >= maxScrollTop) {
                paused = true

                globalThis.setTimeout(() => {
                    container.scrollTop = 0
                    paused = false
                }, 1000)

                return
            }

            container.scrollTop += 1
        }, 40)

        return () => globalThis.clearInterval(interval)
    }, [rows, serverConfig.enableScrolling])

    return (
        <div className="page">
            <header className="header">
                <h1 className="title">{serverConfig.competitionName ?? 'Resultat'}</h1>
            </header>

            <main className="content">
                {Object.keys(groupedResults).length === 0 ? (
                    <div className="empty-state">
                        Inget resultat att presentera just nu.
                    </div>
                ) : (
                    <div
                        className="scroll-container"
                        ref={scrollContainerRef}
                        style={{overflowY: serverConfig.enableScrolling ? 'auto' : 'hidden'}}
                    >
                        <div className="scroll-content">
                            <div style={{height: '10vh'}} />

                            {renderSections()}

                            <div style={{height: '80vh'}}/>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}