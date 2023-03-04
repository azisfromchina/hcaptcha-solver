require('dotenv').config();

const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
    const cpuCount = os.cpus().length;

    for (let i = 0; i < cpuCount; i++) {
        cluster.fork();
    }
} else {
    const uWS = require('uWebSockets.js');
    const Solver = require('./Solver');

    const debug = true;

    process.on('uncaughtException', err => debug ? console.log(err) : {});
    process.on('unhandledRejection', err => debug ? console.log(err) : {});

    const app = uWS.App();

    app.any('/api', async (res, req) => {
        let aborted = false;

        res.onAborted(() => aborted = true);

        let now = Date.now();

        const client = new Solver({
            url: req.getQuery('url'), // https://onlyfans.com
            sitekey: req.getQuery('sitekey') // 314ec50a-c08a-4c0a-a5c4-4ed4c7ed5aff or 7c8456cf-fb4e-48fc-a054-d97bc7765634
        });

        let token = await client.solve(req.getQuery('proxy'));
        let time = +((Date.now() - now) * 0.001).toFixed(3);

        // console.log('[+] Solved - Host: %s | Sitekey: %s', client.host, client.sitekey);

        let data = JSON.stringify(token ? {
            success: true,
            token,
            time
        } : {
            success: false,
            reason: 'Something went wrong'
        });

        if (!aborted) res.end(data);
    });

    app.listen(3001, () => {
        console.log('[+] Started on port 3001');
    });
}
