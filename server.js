import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import bundledServerConfig from './server-config.json' with {type: 'json'}

const app = express()
app.use(cors())

function getPortableBaseDir() {
    return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
}

const CONFIG_DIR = getPortableBaseDir()

const CONFIG_PATH = path.join(CONFIG_DIR, 'server-config.json')

function ensureConfigFile() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, {recursive: true})
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        fs.writeFileSync(
            CONFIG_PATH,
            JSON.stringify(bundledServerConfig, null, 2),
            'utf-8',
        )
    }
}

function getDefaultResultsDir() {
    const exeDir = getPortableBaseDir()

    try {
        fs.accessSync(exeDir, fs.constants.W_OK)
        return path.join(exeDir, 'data')
    } catch {
        return path.join(os.homedir(), 'SSSK Shooting Results', 'data')
    }
}

function readServerConfig() {
    ensureConfigFile()
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))

    if (!config.resultsDir || config.resultsDir.trim() === '') {
        config.resultsDir = getDefaultResultsDir()
    }

    if (!fs.existsSync(config.resultsDir)) {
        fs.mkdirSync(config.resultsDir, {recursive: true})
    }

    return config
}

function writeServerConfig(nextConfig) {
    ensureConfigFile()
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2), 'utf-8')
}

const initialConfig = readServerConfig()
const PORT = initialConfig.port ?? 3001

app.get('/config', (req, res) => {
    res.json(readServerConfig())
})

app.post('/config/results-dir', express.json(), (req, res) => {
    const {resultsDir} = req.body ?? {}

    if (typeof resultsDir !== 'string' || resultsDir.trim() === '') {
        res.status(400).json({message: 'Ogiltig resultatmapp'})
        return
    }

    try {
        const currentConfig = readServerConfig()
        const nextConfig = {
            ...currentConfig,
            resultsDir: resultsDir.trim(),
        }

        writeServerConfig(nextConfig)
        console.log(`Sparade resultatmapp: ${nextConfig.resultsDir}`)
        res.json(nextConfig)
    } catch (error) {
        console.error('Kunde inte spara resultatmapp:', error)
        res.status(500).json({message: 'Kunde inte spara resultatmapp'})
    }
})

app.get('/results', (req, res) => {
    const serverConfig = readServerConfig()
    const RESULTS_DIR = serverConfig.resultsDir
    console.log(`Använder resultatmapp: ${RESULTS_DIR}`)

    if (!RESULTS_DIR || !fs.existsSync(RESULTS_DIR)) {
        res.status(400).send('Ingen giltig resultatmapp är konfigurerad')
        return
    }

    let files = []
    try {
        files = fs.readdirSync(RESULTS_DIR)
    } catch (e) {
        console.error('Kunde inte läsa katalog:', e)
        res.status(500).send('Kunde inte läsa resultatmapp')
        return
    }

    const latestExcelFile = files
        .filter(fileName => fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))
        .map(fileName => {
            try {
                const fullPath = path.join(RESULTS_DIR, fileName)
                return {
                    fileName,
                    fullPath,
                    modifiedTime: fs.statSync(fullPath).mtimeMs,
                }
            } catch (error) {
                console.error(`Kunde inte läsa filinformation för ${fileName}:`, error)
                return null
            }
        })
        .filter(Boolean)
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
    const currentConfig = readServerConfig()
    console.log(`Backend kör på http://localhost:${PORT}`)
    console.log(`Config används: ${CONFIG_PATH}`)
    console.log(`Läser senaste Excel-fil från: ${currentConfig.resultsDir}`)
})