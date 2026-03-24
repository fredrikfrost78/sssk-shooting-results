# SSSK shooting results

A program to display shooting results for shooting competitions.

run with 
`npm run electron`

or create a .exe file with
`npm run pack:win:portable`

## Configuration
The server configuration is stored in `server-config.json`. The `resultsDir` property specifies the directory where the shooting results are stored. If not specified or empty, the default directory is used.

If you want to change the default directory, you can modify the `getDefaultResultsDir` function in `server.js`.



