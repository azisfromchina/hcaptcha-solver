const { default: axios } = require('axios');

let valid = 0;

console.log('[+] Starting hCaptcha Tester');

let startTime = Date.now();

let int = setInterval(async () => {
    try {
        // let { data } = await axios.get('http://162.19.70.185:3001/api?url=https://onlyfans.com&sitekey=7c8456cf-fb4e-48fc-a054-d97bc7765634', { validateStatus: null });
        let { data } = await axios.get('http://localhost:3001/api?url=https://onlyfans.com&sitekey=7c8456cf-fb4e-48fc-a054-d97bc7765634&proxy=us.smartproxy.com:10000', { validateStatus: null });
        if (typeof data === 'object' && data.success) { console.log(data.time); valid++; }
    } catch(err) {}
}, 10);

setInterval(() => {
    let time = Math.floor((Date.now() - startTime) / 1000);
    if (time > 60) return process.exit(1);
    console.log('Valid %d | Time Elapsted: %d seconds', valid, time);
}, 1000);
