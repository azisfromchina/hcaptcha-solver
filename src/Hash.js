const playwright = require('playwright');
const axios = require('axios');
const fs = require('fs');

let hsw;

// let chunks = config.c.req.split('.');
// let data = JSON.parse(atob(chunks[1]));
// let url = `${data.l}/${config.c.type}.js`;

(async function () {
    const pages = [];

    let { data } = await axios.get('https://newassets.hcaptcha.com/c/80e4ca28/hsw.js');
    // const data = fs.readFileSync('./hsw.js', 'utf-8');

    for (let i = 0; i < 1; i++) {
        const browser = await playwright.chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto('https://example.com/');
        await page.evaluate(data);

        pages.push(page);
    }

    let pageIndex = 0;

    hsw = async function (token) {
        let page = pages[pageIndex++ % pages.length];

        return await page.evaluate(token => {
            return hsw(token);
        }, token);
    }

    if (hash.onready) hash.onready();
})();

async function hash() {
    return await hsw.apply(this, arguments);
}

module.exports = hash;
