import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import serverConfig from './server-config.json' with { type: 'json' }

const app = express()
app.use(cors())

const PORT = serverConfig.port ?? 3001
const RESULTS_DIR = serverConfig.resultsDir

app.get('/results', (req, res) => {
    const latestExcelFile = fs
        .readdirSync(RESULTS_DIR)
        .filter(fileName => fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))
        .map(fileName => ({
            fileName,
            fullPath: path.join(RESULTS_DIR, fileName),
            modifiedTime: fs.statSync(path.join(RESULTS_DIR, fileName)).mtimeMs,
        }))
        .sort((a, b) => b.modifiedTime - a.modifiedTime)[0]

    if (!latestExcelFile) {
        res.status(404).send('Ingen resultatfil hittades')
        return
    }

    res.sendFile(latestExcelFile.fullPath, err => {
        if (err) {
            console.error('Kunde inte läsa fil:', err)
            res.status(404).send('Filen hittades inte')
        }
    })
})

app.listen(PORT, () => {
    console.log(`Backend kör på http://localhost:${PORT}`)
    console.log(`Läser senaste Excel-fil från: ${RESULTS_DIR}`)
})