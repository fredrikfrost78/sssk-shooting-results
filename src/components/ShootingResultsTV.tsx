import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './ShootingResultsTV.css'
import config from '../config/appConfig.json'

type ResultRow = {
    klass: string
    namn: string
    klubb: string
    series: number[]
    x: number
    summa: number
}

type GroupedResults = Record<string, ResultRow[]>

const parseNumber = (value: unknown): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const trimmed = value.trim().replace(',', '.')
        const parsed = Number(trimmed)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

const c = config.columns

const normalizeRow = (row: Record<string, unknown>) => {
    const series = c.series.map(col => parseNumber(row[col]))

    return {
        klass: String(row[c.klass] ?? ''),
        namn: String(row[c.namn] ?? ''),
        klubb: String(row[c.klubb] ?? ''),
        series,
        x: parseNumber(row[c.antalX]),
        summa: parseNumber(row[c.summa]),
    }
}

const groupAndSort = (rows: ResultRow[]): GroupedResults => {
    const grouped: GroupedResults = {}

    for (const row of rows) {
        if (!row.klass || !row.namn) continue
        if (!grouped[row.klass]) grouped[row.klass] = []
        grouped[row.klass].push(row)
    }

    for (const klass of Object.keys(grouped)) {
        grouped[klass].sort((a, b) => {
            if (b.summa !== a.summa) return b.summa - a.summa
            return a.namn.localeCompare(b.namn, 'sv')
        })
    }

    return Object.fromEntries(
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'sv')),
    )
}

export default function ShootingResultsTV(): ReactElement {
    const [rows, setRows] = useState<ResultRow[]>([])
    const scrollContainerRef = useRef<HTMLDivElement | null>(null)

    const groupedResults = useMemo(() => groupAndSort(rows), [rows])

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
                        {config.columns.series.map((_, index) => (
                            <th key={index} className="results-header-cell">
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
                        ...Array(1).fill(null)
                    ].map((row, index) =>
                        row ? (
                            <tr key={`${klass}-${row.namn}-${index}`} className="results-row">
                                <td className="results-cell">{index + 1}</td>
                                <td className="results-cell">{row.namn}</td>
                                <td className="results-cell">{row.klubb}</td>
                                {row.series.map((value: string, i: number) => (
                                    <td key={i}  className="results-cell">{value}</td>
                                ))}
                                <td className="results-cell">{row.x}</td>
                                <td className="results-cell total-cell">{row.summa}</td>
                            </tr>
                        ) : (
                            <tr key={`empty-${klass}-${index}`}  className="results-row">
                                <td
                                    colSpan={config.columns.series.length + 5}
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
        const load = async (): Promise<void> => {
            try {
                const response = await fetch(config.resultsUrl)

                if (!response.ok) {
                    throw new Error(`Kunde inte läsa filen: ${config.resultsUrl} (${response.status})`)
                }

                const buffer = await response.arrayBuffer()
                const workbook = XLSX.read(buffer, { type: 'array' })

                const sheet = workbook.Sheets[workbook.SheetNames[0]]
                const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
                    defval: '',
                })

                const parsed = raw.map(normalizeRow)
                setRows(parsed)
            } catch (error) {
                console.error('Fel vid inläsning av resultatfil:', error)
            }
        }

        void load()
        const interval = window.setInterval(() => {
            void load()
        }, config.pollingIntervalMs)

        return () => window.clearInterval(interval)
    }, [])

    useEffect(() => {
        const container = scrollContainerRef.current
        if (!config.enableScrolling || !container || rows.length === 0) return

        let paused = false

        const interval = window.setInterval(() => {
            if (paused) return

            const maxScrollTop = container.scrollHeight - container.clientHeight

            console.log('Scrolling', container.scrollTop, maxScrollTop)

            if (container.scrollTop+1 >= maxScrollTop) {
                paused = true

                window.setTimeout(() => {
                    container.scrollTop = 0
                    paused = false
                }, 1000)

                return
            }

            container.scrollTop += 1
        }, 40)

        return () => window.clearInterval(interval)
    }, [rows])

    return (
        <div className="page">
            <header className="header">
                <h1 className="title">Resultat</h1>
            </header>

            <main className="content">
                {Object.keys(groupedResults).length === 0 ? (
                    <div className="empty-state">
                        Inget resultat att presentera just nu.
                    </div>
                ) : (
                    <div className="scroll-container" ref={scrollContainerRef}>
                        <div className="scroll-content">
                            {renderSections()}

                            <div style={{ height: '80vh' }} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}