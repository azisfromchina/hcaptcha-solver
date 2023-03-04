const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
    const worker = new Worker(__filename);
    const promises = {};

    let index = 0;

    worker.on('message', data => {
        promises[data.id](data.message);
        delete promises[data.id];
    });

    module.exports = function (input) {
        return new Promise((resolve, reject) => {
            let data = { id: index++, message: input };
            promises[data.id] = resolve;
            worker.postMessage(data);
        });
    };
} else {
    const knnClassifier = require('@tensorflow-models/knn-classifier');
    const mobilenet = require('@tensorflow-models/mobilenet');
    const tf = require('@tensorflow/tfjs-node-gpu');
    const path = require('path');
    const fs = require('fs');

    const classifier = knnClassifier.create();

    const classes = fs.readdirSync('./data');
    const datafolder = '../data';

    let net;

    function readImage(input) {
        const data = typeof input === 'string' ? fs.readFileSync(input) : input;

        if (typeof input === 'string' && data.byteLength === 0) {
            return fs.rmSync(input);
        }

        return tf.node.decodeImage(data);
    }

    async function imageClassification(data) {
        const image = readImage(data);
        const activation = net.infer(image, 'conv_preds');
        const result = await classifier.predictClass(activation);
        tf.dispose(image);
        //console.timeEnd(d);
        return result;
    }

    async function trainModel() {
        net = await mobilenet.load();
        console.log('[+] Loaded Model');

        for (let className of classes) {
            let files = fs.readdirSync(path.resolve(__dirname, `${datafolder}/${className}`));

            for (let file of files) {
                const image = readImage(path.resolve(__dirname, `${datafolder}/${className}/${file}`));

                if (image) {
                    const activation = net.infer(image, true);
                    classifier.addExample(activation, className);
                }
            }
        }

        console.log('[+] Loaded Dataset');

        return;
    }

    trainModel();

    parentPort.on('message', async (data) => {
        let result = await imageClassification(data.message);
        parentPort.postMessage({ id: data.id, message: result });
    });

    // module.exports = imageClassification;
}
