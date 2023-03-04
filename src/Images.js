const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
    module.exports = function (input) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
                workerData: input
            });

            worker.once('message', data => {
                resolve(data);
            });
        });
    };
} else {
    const { default: axios } = require('axios');

    (async () => {
        let images = [];

        for (let task of workerData) {
            if (task.skip) {
                images.push(null);
                continue;
            }

            let res = axios.get(task.datapoint_uri, {
                responseType: 'arraybuffer',
                headers: {
                    'accept-encoding': 'gzip, deflate, br'
                }
            });

            images.push(res);
        }

        // let result = await hsw(workerData);
        parentPort.postMessage(
            (await Promise.all(images)).map(a => a.data)
        );
    })();

    // module.exports = hsw;
}