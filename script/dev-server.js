const path = require('path');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');

const projectCfg = require('./config');
const projectRoot = path.resolve('.');

/* eslint-disable no-console */

process.on('SIGINT', () => {
    console.log('\nCtrl-C Pressed. Exiting...\n');
    mainProcess.kill();
    process.exit(0);
});

const mainProcess = require('child_process').exec(`electron ${projectRoot}/src/main/index.dev.js`);
mainProcess.stdout.pipe(process.stdout);
mainProcess.stderr.pipe(process.stderr);
mainProcess.on('close', code => {
    console.log('\nElectron exited. Exiting...');
    process.exit(code);
});

let compileCfg = require('./webpack.config.renderer');
compileCfg.entry.renderer.unshift(
    `webpack-dev-server/client?http://localhost:${projectCfg.devPort}/`,
    'webpack/hot/dev-server'
);
compileCfg.plugins.push(
    new webpack.HotModuleReplacementPlugin()
);
const compiler = webpack(compileCfg);

const serverCfg = {
    hot: true,
    stats: 'minimal',
    overlay: true,
    contentBase: path.join(projectRoot, 'src')
};

const devServer = new WebpackDevServer(compiler, serverCfg);
devServer.listen(projectCfg.devPort);
