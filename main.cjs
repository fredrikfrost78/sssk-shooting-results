const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const XLSX = require('xlsx')

let mainWindow = null
let resultsWatcher = null
let watchDebounceTimeout = null
const isLoggingEnabled = false
function getBundledConfigPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'server-config.json')
    }
    return path.join(__dirname, 'server-config.json')
}

const bundledServerConfig = JSON.parse(
    fs.readFileSync(getBundledConfigPath(), 'utf-8')
)

//if local return this folder, else return where the executable is
function getPortableBaseDir() {
    if (!app.isPackaged) {
        return __dirname
    }

    return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
}

//where is the config file
function getConfigPath() {
    return path.join(getPortableBaseDir(), './server-config.json')
}

//where to put the log file
function getMainLogPath() {
    return path.join(getPortableBaseDir(), 'main.log')
}

//log to file
function logMain(message) {
    if (!isLoggingEnabled) {
        return
    }
    const line = `[${new Date().toISOString()}] ${message}\n`

    try {
        fs.appendFileSync(getMainLogPath(), line, 'utf-8')
    } catch {
        // ignore logging failures
    }
}

//make sure the config file exists
function ensureConfigFile() {
    const configPath = getConfigPath()

    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(
            configPath,
            JSON.stringify(bundledServerConfig, null, 2),
            'utf-8',
        )
    }
}

//read the config file
function readConfig() {
    ensureConfigFile()
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
}

//write to the config file
function writeConfig(nextConfig) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf-8')
    return nextConfig
}

//map the columns to the index in the row
function columnLetterToIndex(column) {
    const normalized = String(column || '').trim().toUpperCase()
    let index = 0

    for (let i = 0; i < normalized.length; i += 1) {
        index = index * 26 + (normalized.codePointAt(i) - 64)
    }

    return index - 1
}

function getCellValue(row, column) {
    const index = columnLetterToIndex(column)
    return row[index] ?? ''
}

function parseNumber(value) {
    if (typeof value === 'number') {
        return value
    }

    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim()
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : 0
    }

    return 0
}

//read a row from the excel file and normalize it to the format we use
function normalizeRow(row, columns) {
    const series = columns.series.map(column => parseNumber(getCellValue(row, column)))

    return {
        klass: String(getCellValue(row, columns.klass) ?? ''),
        namn: String(getCellValue(row, columns.namn) ?? ''),
        klubb: String(getCellValue(row, columns.klubb) ?? ''),
        series,
        x: parseNumber(getCellValue(row, columns.antalX)),
        summa: parseNumber(getCellValue(row, columns.summa)),
    }
}

//find the latest excel file in the results dir
function findLatestExcelFile(resultsDir) {
    if (!resultsDir || !fs.existsSync(resultsDir)) {
        return null
    }

    logMain(`resultsDir: ${resultsDir}`)

    const files = fs.readdirSync(resultsDir)
        .filter(fileName => {
            const lower = fileName.toLowerCase()
            return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')
        })
        .map(fileName => {
            const fullPath = path.join(resultsDir, fileName)
            return {
                fullPath,
                modifiedTime: fs.statSync(fullPath).mtimeMs,
            }
        })
        .sort((a, b) => b.modifiedTime - a.modifiedTime)

    return files[0] ?? null
}

//clean-up for the result file watcher
function stopResultsWatcher() {
    if (watchDebounceTimeout) {
        clearTimeout(watchDebounceTimeout)
        watchDebounceTimeout = null
    }

    if (resultsWatcher) {
        resultsWatcher.close()
        resultsWatcher = null
    }
}

//send message to renderer to reload the results but in a controlled way
function notifyResultsChanged() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if (watchDebounceTimeout) {
        clearTimeout(watchDebounceTimeout)
    }

    watchDebounceTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('results:changed')
            logMain('Skickade results:changed till renderer')
        }
    }, 300)
}

//start watching the results dir for changes
function startResultsWatcher() {
    stopResultsWatcher()

    const currentConfig = readConfig()
    const resultsDir = currentConfig.resultsDir

    if (!resultsDir || !fs.existsSync(resultsDir)) {
        logMain(`Ingen watcher startad, resultatmapp saknas: ${resultsDir || ''}`)
        return
    }

    try {
        resultsWatcher = fs.watch(resultsDir, (_eventType, fileName) => {
            logMain(`Filändring upptäckt i resultatmapp: ${fileName || ''}`)
            notifyResultsChanged()
        })
        logMain(`Watcher startad för resultatmapp: ${resultsDir}`)
    } catch (error) {
        logMain(`Kunde inte starta watcher: ${error instanceof Error ? error.stack || error.message : String(error)}`)
    }
}

//validate rows
function isValidResultRow(row) {
    if (!row.klass || !row.namn) {
        return false
    }

    const normalizedKlass = row.klass.trim().toUpperCase()
    const normalizedNamn = row.namn.trim().toUpperCase()
    const normalizedKlubb = row.klubb.trim().toUpperCase()

    if (normalizedKlass === 'KLASS' || normalizedNamn === 'NAMN') {
        return false
    }

    return !(normalizedKlubb === 'KLUBB' && row.summa === 0 && row.x === 0 && row.series.every(value => value === 0));


}

//register IPC handlers for the renderer to call
function registerIpcHandlers() {
    ipcMain.handle('config:get', async () => {
        return readConfig()
    })

    ipcMain.handle('config:save', async (_event, nextConfig) => {
        const currentConfig = readConfig()
        const savedConfig = writeConfig({
            ...currentConfig,
            ...nextConfig,
            columns: {
                ...currentConfig.columns,
                ...(nextConfig?.columns || {}),
            },
        })
        startResultsWatcher()
        return savedConfig
    })

    ipcMain.handle('results:load', async () => {
        const config = readConfig()
        const latestExcelFile = findLatestExcelFile(config.resultsDir)

        if (!latestExcelFile) {
            return {
                config,
                rows: [],
            }
        }

        const workbook = XLSX.readFile(latestExcelFile.fullPath)
        const preferredSheetName = config.sheetName
        const sheetName =
            (preferredSheetName && workbook.Sheets[preferredSheetName] && preferredSheetName) ||
            workbook.SheetNames[config.sheetIndex ?? 0] ||
            workbook.SheetNames[0]

        if (!sheetName) {
            return {
                config,
                rows: [],
            }
        }

        const sheet = workbook.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
        })

        const rows = raw
            .slice(1)
            .map(row => normalizeRow(row, config.columns))
            .filter(isValidResultRow)

        return {
            config,
            rows,
        }
    })

    ipcMain.handle('results-dir:choose', async () => {
        if (!mainWindow) {
            return null
        }

        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Välj resultatmapp',
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        const updatedConfig = {
            ...readConfig(),
            resultsDir: result.filePaths[0],
        }

        const savedConfig = writeConfig(updatedConfig)
        startResultsWatcher()
        return savedConfig
    })

    ipcMain.handle('config:reset', async () => {
        const resetConfig = writeConfig({
            ...bundledServerConfig,
        })
        startResultsWatcher()
        return resetConfig
    })
}

//create the main window
function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.cjs')

    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        autoHideMenuBar: false,
        backgroundColor: '#111111',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    const indexPath = path.join(__dirname, 'dist', 'index.html')
    mainWindow.loadFile(indexPath)

    mainWindow.on('closed', () => {
        mainWindow = null
        app.quit()
    })
}

//create the menu for settings
function createMenu() {
    const template = [
        {
            label: 'Arkiv',
            submenu: [
                {
                    label: 'Välj resultatmapp...',
                    click: async () => {
                        if (!mainWindow) return

                        try {
                            const result = await dialog.showOpenDialog(mainWindow, {
                                properties: ['openDirectory'],
                                title: 'Välj resultatmapp',
                            })

                            if (result.canceled || result.filePaths.length === 0) {
                                return
                            }

                            writeConfig({
                                ...readConfig(),
                                resultsDir: result.filePaths[0],
                            })

                            startResultsWatcher()
                            mainWindow.webContents.send('results:changed')
                        } catch (error) {
                            logMain(`Kunde inte spara resultatmapp: ${error instanceof Error ? error.stack || error.message : String(error)}`)
                            dialog.showErrorBox(
                                'Kunde inte spara resultatmapp',
                                error instanceof Error ? error.message : String(error),
                            )
                        }
                    },
                },
                { type: 'separator' },
                { role: 'quit', label: 'Avsluta' },
            ],
        },
        {
            label: 'Inställningar',
            submenu: [
                {
                    label: 'Öppna config-fil',
                    click: async () => {
                        try {
                            const configPath = getConfigPath()
                            await shell.openPath(configPath)
                        } catch (error) {
                            logMain(`Kunde inte öppna config-fil: ${error instanceof Error ? error.stack || error.message : String(error)}`)
                            dialog.showErrorBox(
                                'Kunde inte öppna config-fil',
                                error instanceof Error ? error.message : String(error),
                            )
                        }
                    },
                },
                {
                    label: 'Återställ standardinställningar',
                    click: async () => {
                        if (!mainWindow) return

                        try {
                            const result = await dialog.showMessageBox(mainWindow, {
                                type: 'warning',
                                buttons: ['Avbryt', 'Återställ'],
                                defaultId: 1,
                                cancelId: 0,
                                title: 'Återställ standardinställningar',
                                message: 'Vill du återställa server-config.json till standardvärden?',
                                detail: 'Detta ersätter nuvarande inställningar med de värden som följer med appen.',
                            })

                            if (result.response !== 1) {
                                return
                            }

                            writeConfig({
                                ...bundledServerConfig,
                            })

                            startResultsWatcher()
                            mainWindow.webContents.send('results:changed')
                        } catch (error) {
                            logMain(`Kunde inte återställa config: ${error instanceof Error ? error.stack || error.message : String(error)}`)
                            dialog.showErrorBox(
                                'Kunde inte återställa config',
                                error instanceof Error ? error.message : String(error),
                            )
                        }
                    },
                },
            ],
        },
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

//log the current config
function logCurrentConfig() {
    try {
        const currentConfig = readConfig()
        logMain(`Config används: ${getConfigPath()}`)
        logMain(`Läser senaste Excel-fil från: ${currentConfig.resultsDir || ''}`)
    } catch (error) {
        logMain(`Kunde inte läsa config: ${error instanceof Error ? error.stack || error.message : String(error)}`)
    }
}

//start the app
app.whenReady().then(() => {
    logMain('app.whenReady körs')
    ensureConfigFile()
    registerIpcHandlers()
    logCurrentConfig()
    createWindow()
    createMenu()
    startResultsWatcher()
})

//quit the app when all windows are closed
app.on('window-all-closed', () => {
    app.quit()
})

//before quitting, stop the result file watcher
app.on('before-quit', () => {
    stopResultsWatcher()
})