const { HttpsProxyAgent } = require('hpagent');
const { default: axios } = require('axios');
const { EventEmitter } = require('events');
const getImages = require('./Images.js');
const solveImage = require('./AI.js');
const phash = require('./phash.js');
const sharp = require('sharp');
const hash = require('../hsw.js');
const fs = require('fs');

const uuids = {};

class Client extends EventEmitter {
    constructor(opts) {
        super();
        this.init(opts);
    }

    async init(opts) {
        let { host } = new URL(opts.url);

        this.host = host;
        this.href = opts.url;
        this.sitekey = opts.sitekey;
        if (!this.version) this.version = await this.getVersion();

        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4950.0 Safari/537.36';

        // hash.onready = () => 
        this.emit('ready');
    }

    async solve(proxy) {
        return new Promise(async resolve => {
            let agent = new HttpsProxyAgent({
                //proxy: 'http://user-sp08f56c8e:sp08f56c8e@state.smartproxy.com:15000',
                proxy: 'http://' + proxy,
                keepAlive: true
            });

            try {
                //console.log(0);

                let now = Date.now();
                let config = await this.checkSiteConfig(agent);
                //console.log(1);

                let data = await this.getCaptcha(agent, now, config);
                //console.log(2);

                if (data.pass) {
                    if (agent) agent.destroy();
                    return resolve(data.generated_pass_UUID);
                }

                let answers = await this.solveImages(data, agent);
                //console.log(answers);

                setTimeout(async () => {
                //return resolve('pass');
                let res = await this.solveCaptcha(agent, now, data, answers);

                if (agent) agent.destroy();

                if (!res.pass) {
                    global.count = global.count ? global.count + 1 : 1;
                    console.log(global.count, res.pass);
                }

                resolve(res.pass ? res.generated_pass_UUID : null);
                }, data.tasklist.length * 250);
            } catch (err) {
                //console.log(err);
                if (agent) agent.destroy();
                // resolve(await this.solve());
                resolve(null);
            }
        });
    }

    toEnglish(str) {
        let table = new Map([
            ['а', 'a'],
            ['е', 'e'],
            ['і', 'i'],
            ['о', 'o'],
            ['ο', 'o'],
            ['р', 'p'],
            ['ѕ', 's'],
            ['с', 'c'],
            ['у', 'y'],
            ['x', 'x']
        ]);

        return str.replace(/\W/g, c => table.get(c) || '\\' + c.charCodeAt().toString(16));
    }

    async solveImages(body, agent) {
        let item = this.toEnglish(body.requester_question.en.split(' ').pop());
        //console.log(item);

        /*for (let image of body.requester_question_example) {
            break;

            let { data } = await axios.get(image, {
                responseType: 'arraybuffer',
                headers: {
                    'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image\/*,*\/*;q=0.8',
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9',
                    'referer': 'https://newassets.hcaptcha.com/',
                    'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="101"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Linux"',
                    'sec-fetch-dest': 'image',
                    'sec-fetch-mode': 'no-cors',
                    'sec-fetch-site': 'same-site',
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36'
                }
            });

            let hash = await phash(data);

            let body = await sharp(data).resize(32, 32, { fit: 'fill' }).toBuffer();

            if (!fs.existsSync(`./data/${item}`)) {
                fs.mkdirSync(`./data/${item}`);
            }

            fs.writeFileSync(`./data/${item}/${hash}.png`, body);
        }*/

        let answers = {};

        //console.log(item, body.requester_question);

        //let now = Date.now();
        //console.time(now);
        //let images = await getImages(body.tasklist.map(a => ({ skip: a.task_key in uuids, ...a })), agent);
        //console.timeEnd(now);

        // for (let i = 0; i < images.length; i++) {
        for (let task of body.tasklist) {
            //let now = Math.random().toString(36).slice(2);
            //console.time(now);

            let { data } = await axios.get(task.datapoint_uri, {
                httpsAgent: agent,
                responseType: 'arraybuffer',
                headers: {
                    'accept-encoding': 'gzip, deflate, br'
                }
            });

            //console.timeEnd(now);

            // let data = images[i];
            // let task = body.tasklist[i];
            let result = uuids[task.task_key];

            if (!result) {
                result = await solveImage(data);
                uuids[task.task_key] = result.label;
            } else {
                console.log(1);
            }

            answers[task.task_key] = Boolean(item === result.label).toString();

            // fs.writeFileSync(`./test/${task.task_key}.png`, data);
        }

        // console.log(body.tasklist, answers, item);

        return answers;
    }

    getMeanPeriod(data) {
        let mp = 0;

        for (let i = 1; i < data.length; i++) {
            let last = data[i][2] - data[i - 1][2];
            mp = (mp * (i - 1) + last) / i;
        }

        return mp;
    }

    randomize(now, data) {
        let out = [];

        data = data.slice(5);

        for (let i = 0; i < data.length; i++) {
            let other = data[i];
            let timestamp = other.pop();

            if (i > 0) {
                timestamp = out[i - 1][2] + Math.floor(Math.random() * 60);
            } else {
                timestamp = now;
            }

            out.push([...other, timestamp]);
        }

        return out; //data.map((a, i, c) => [a[0], a[1], (i ? c[i - 1][2] : now) + Math.floor(Math.random() * 60)]);
    }

    async solveCaptcha(agent, now, info, answers) {
        //console.time(now);
        let encoded = await hash(info.c.req);
        //console.timeEnd(now);

        let mm = this.randomize(now, [
            [0, 298, 1651885779798],
            /*[41, 295, 1651885779814],
            [93, 292, 1651885779830],
            [163, 291, 1651885779846],
            [250, 294, 1651885779862],
            [338, 305, 1651885779878],
            [398, 154, 1651885782432],
            [345, 175, 1651885782448],
            [308, 185, 1651885782464],
            [274, 191, 1651885782480],
            [243, 193, 1651885782496],
            [216, 194, 1651885782512],
            [192, 195, 1651885782528],
            [173, 198, 1651885782544],
            [160, 202, 1651885782561],
            [150, 204, 1651885782577],
            [144, 208, 1651885782593],
            [136, 212, 1651885782614],
            [126, 217, 1651885782631],
            [113, 223, 1651885782647],
            [99, 226, 1651885782664],
            [80, 228, 1651885782686],
            [75, 228, 1651885782705],
            [75, 228, 1651885782778],
            [78, 225, 1651885782794],
            [82, 220, 1651885782812],
            [91, 216, 1651885782828],
            [106, 214, 1651885782844],
            [132, 215, 1651885782860],
            [161, 218, 1651885782876],
            [187, 219, 1651885782892],
            [209, 219, 1651885782908],
            [227, 217, 1651885782924],
            [244, 215, 1651885782940],
            [253, 213, 1651885782960],
            [254, 212, 1651885783004],
            [258, 211, 1651885783021],
            [265, 207, 1651885783037],
            [273, 205, 1651885783054],
            [280, 203, 1651885783072],
            [289, 200, 1651885783089],
            [297, 199, 1651885783105],
            [304, 197, 1651885783127],
            [303, 197, 1651885783392],
            [301, 197, 1651885783408],
            [298, 197, 1651885783424],
            [292, 198, 1651885783440],
            [277, 200, 1651885783456],
            [261, 202, 1651885783472],
            [243, 203, 1651885783488],
            [230, 203, 1651885783505],
            [218, 203, 1651885783521],
            [206, 202, 1651885783537],
            [198, 201, 1651885783553],
            [195, 201, 1651885783733],
            [197, 208, 1651885783750],
            [207, 224, 1651885783766],
            [222, 250, 1651885783782],
            [239, 281, 1651885783798],
            [272, 334, 1651885783820],
            [307, 382, 1651885783836],
            [340, 422, 1651885783852],
            [369, 449, 1651885783868],
            [389, 468, 1651885783884],
            [399, 479, 1651885783900],
            [399, 483, 1651885783927],
            [391, 488, 1651885783943],
            [383, 494, 1651885783959],
            [372, 498, 1651885783975],
            [360, 502, 1651885783991],
            [341, 504, 1651885784007],
            [312, 507, 1651885784023],
            [277, 506, 1651885784039],
            [240, 501, 1651885784057],
            [212, 497, 1651885784073],
            [184, 490, 1651885784089],
            [158, 485, 1651885784105],
            [139, 482, 1651885784121],
            [124, 482, 1651885784137],
            [116, 486, 1651885784154],
            [113, 489, 1651885784171],
            [113, 492, 1651885784191],
            [114, 495, 1651885784207],
            [117, 498, 1651885784225],
            [124, 501, 1651885784242],
            [135, 507, 1651885784258],
            [152, 515, 1651885784274],
            [170, 523, 1651885784290],
            [194, 530, 1651885784306],
            [219, 538, 1651885784322],
            [246, 546, 1651885784338],
            [274, 554, 1651885784354],
            [297, 559, 1651885784370],
            [312, 560, 1651885784388],
            [318, 559, 1651885784408],
            [318, 555, 1651885784424],
            [312, 547, 1651885784440],
            [298, 532, 1651885784456],
            [281, 520, 1651885784472],
            [263, 512, 1651885784488],
            [241, 504, 1651885784504],
            [214, 494, 1651885784520],
            [186, 485, 1651885784536],
            [164, 482, 1651885784552],
            [148, 479, 1651885784568],
            [132, 477, 1651885784584],
            [118, 474, 1651885784600],
            [109, 470, 1651885784616],
            [100, 465, 1651885784632],
            [90, 460, 1651885784648],
            [89, 458, 1651885784784],
            [97, 461, 1651885784800],
            [114, 464, 1651885784816],
            [138, 470, 1651885784836],
            [158, 472, 1651885784852],
            [176, 472, 1651885784869],
            [189, 472, 1651885784885],
            [198, 471, 1651885784902],
            [203, 470, 1651885785017],
            [207, 470, 1651885785034],
            [220, 473, 1651885785050],
            [240, 476, 1651885785066],
            [275, 481, 1651885785084],
            [303, 485, 1651885785100],
            [325, 485, 1651885785117],
            [336, 483, 1651885785133],
            [339, 481, 1651885785153],
            [339, 481, 1651885785278],
            [342, 487, 1651885785294],
            [349, 505, 1651885785310],
            [359, 528, 1651885785326],
            [371, 553, 1651885785345],
            [380, 567, 1651885785361],
            [381, 570, 1651885785406],
            [380, 569, 1651885785429],
            [379, 568, 1651885785446],
            [378, 566, 1651885785465],
            [376, 566, 1651885785485],
            [373, 565, 1651885785504],
            [369, 565, 1651885785524],
            [366, 565, 1651885785542]*/
        ]);

        let md = this.randomize(now, [
            [304, 197, 1651885783282],
            [195, 200, 1651885783627],
            [88, 458, 1651885784719],
            [202, 470, 1651885784949],
            [339, 480, 1651885785210],
            [365, 565, 1651885785601]
        ]);

        let mu = this.randomize(now, [
            [304, 197, 1651885783382],
            [195, 200, 1651885783708],
            [90, 458, 1651885784789],
            [205, 470, 1651885785030],
            [339, 480, 1651885785275],
            [365, 565, 1651885785661]
        ]);

        let nv_mm = this.randomize(now, [
            [798, 483, 1651885776706],
            [736, 465, 1651885776722],
            [682, 452, 1651885776738],
            [633, 445, 1651885776754],
            [589, 445, 1651885776770],
            [550, 454, 1651885776786],
            [523, 462, 1651885776802],
            [504, 468, 1651885776818],
            [489, 479, 1651885776834],
            [473, 496, 1651885776850],
            [460, 510, 1651885776866],
            [276, 561, 1651885779743],
            [280, 560, 1651885779759],
            [287, 560, 1651885779775],
            [302, 560, 1651885779791],
            [721, 575, 1651885779897],
            [788, 580, 1651885779913],
            [798, 291, 1651885782359],
            [784, 332, 1651885782375],
            [767, 363, 1651885782391],
            [745, 389, 1651885782407],
            [713, 412, 1651885782423],
            [706, 742, 1651885783908]
        ]);

        //console.log(2, info);

        let body = {
            'answers': answers,
            'c': JSON.stringify(info.c),
            'job_mode': info.request_type,
            'motionData': '{"st":1652126824288,"dct":1652126824288,"mm":[[399,254,1652126826339],[381,257,1652126826355],[369,257,1652126826372],[360,255,1652126826388],[351,253,1652126826405],[341,253,1652126826421],[332,253,1652126826437],[326,253,1652126826453],[326,252,1652126826477],[328,249,1652126826494],[336,246,1652126826510],[338,246,1652126826944],[338,244,1652126826964],[345,240,1652126826981],[356,235,1652126826997],[363,232,1652126827013],[364,229,1652126827105],[364,226,1652126827121],[363,224,1652126827333],[362,224,1652126827466],[359,225,1652126827483],[355,228,1652126827500],[347,235,1652126827516],[332,257,1652126827535],[317,288,1652126827551],[304,327,1652126827567],[299,367,1652126827583],[298,405,1652126827602],[299,424,1652126827618],[300,434,1652126827634],[300,441,1652126827650],[300,444,1652126827671],[301,444,1652126827706],[301,447,1652126827722],[301,448,1652126827796],[301,450,1652126827816],[303,450,1652126827844],[303,451,1652126827952],[303,451,1652126827981],[300,450,1652126827999],[296,450,1652126828017],[284,451,1652126828033],[261,456,1652126828055],[245,460,1652126828072],[236,462,1652126828090],[234,463,1652126828111],[231,463,1652126828131],[228,461,1652126828147],[224,460,1652126828164],[222,458,1652126828181],[220,458,1652126828495],[217,456,1652126828511],[209,452,1652126828527],[192,442,1652126828543],[165,429,1652126828559],[126,408,1652126828580],[97,394,1652126828596],[74,381,1652126828612],[57,369,1652126828628],[49,359,1652126828645],[48,355,1652126828662],[48,352,1652126828679],[49,350,1652126828695],[51,349,1652126828726],[51,349,1652126828746],[52,349,1652126828770],[53,349,1652126828793],[53,348,1652126828820],[55,348,1652126828852],[56,348,1652126828868],[56,347,1652126828884],[58,347,1652126828909],[59,346,1652126828931],[61,346,1652126828955],[64,346,1652126828976],[68,346,1652126828996],[71,347,1652126829012],[74,348,1652126829030],[76,349,1652126829046],[81,350,1652126829063],[85,351,1652126829084],[87,352,1652126829101],[87,351,1652126829623],[87,346,1652126829642],[87,344,1652126829849],[87,336,1652126829866],[87,324,1652126829883],[87,311,1652126829900],[84,300,1652126829918],[83,297,1652126830196],[81,305,1652126830212],[79,318,1652126830228],[78,334,1652126830244],[79,349,1652126830261],[83,360,1652126830277],[88,368,1652126830293],[93,374,1652126830310],[98,378,1652126830328],[102,380,1652126830346],[106,380,1652126830363],[111,379,1652126830379],[122,377,1652126830395],[135,374,1652126830412],[149,372,1652126830428],[164,376,1652126830445],[181,385,1652126830463],[203,398,1652126830479],[226,412,1652126830495],[250,426,1652126830511],[278,444,1652126830530],[301,459,1652126830546],[322,475,1652126830562],[344,491,1652126830578],[360,503,1652126830594],[372,510,1652126830611],[376,510,1652126830627],[375,510,1652126830666],[375,508,1652126830910],[375,507,1652126831057],[376,506,1652126831091],[376,503,1652126831109],[374,496,1652126831125],[368,484,1652126831141],[359,468,1652126831157],[343,450,1652126831173],[326,434,1652126831189],[307,418,1652126831205],[291,405,1652126831221],[280,391,1652126831237],[269,376,1652126831257],[264,366,1652126831273],[261,358,1652126831289],[259,351,1652126831307],[257,346,1652126831324],[256,342,1652126831340],[256,337,1652126831356],[255,330,1652126831372],[255,324,1652126831388],[255,318,1652126831406],[256,311,1652126831422],[258,299,1652126831438],[262,285,1652126831454],[267,268,1652126831470],[272,254,1652126831488],[279,243,1652126831504],[284,234,1652126831520],[292,226,1652126831537],[298,217,1652126831553],[304,210,1652126831570],[307,204,1652126831587],[309,202,1652126831605],[309,200,1652126831623],[310,201,1652126832188],[310,207,1652126832205],[310,218,1652126832221],[309,232,1652126832237],[309,261,1652126832258],[309,286,1652126832274],[309,308,1652126832290],[310,328,1652126832306],[312,345,1652126832322],[314,366,1652126832338],[317,387,1652126832356],[320,407,1652126832372],[323,423,1652126832388],[325,436,1652126832404],[326,446,1652126832421],[326,453,1652126832438],[326,459,1652126832455],[326,465,1652126832471],[326,472,1652126832489],[326,480,1652126832505],[327,492,1652126832522],[328,505,1652126832538],[330,519,1652126832554],[334,533,1652126832570],[336,545,1652126832587],[339,554,1652126832603],[341,559,1652126832619],[343,564,1652126832635],[345,571,1652126832653],[347,578,1652126832669],[349,583,1652126832686],[351,585,1652126832714],[352,585,1652126832736],[352,584,1652126832812],[352,580,1652126832830],[352,576,1652126832850],[352,573,1652126832875],[352,571,1652126832902],[351,570,1652126832918],[349,569,1652126832934],[348,566,1652126832951],[348,562,1652126832969],[347,559,1652126832985],[347,556,1652126833014],[347,555,1652126833036]],"mm-mp":4.405921052631557,"md":[[304,451,1652126827857],[221,458,1652126828272],[310,200,1652126831888],[347,555,1652126833230]],"md-mp":1791,"mu":[[304,451,1652126827942],[221,458,1652126828373],[310,200,1652126832004],[347,555,1652126833346]],"mu-mp":1801.3333333333333,"topLevel":{"st":1652126815558,"sc":{"availWidth":1920,"availHeight":1036,"width":1920,"height":1080,"colorDepth":24,"pixelDepth":24,"availLeft":0,"availTop":0,"onchange":null,"isExtended":false},"nv":{"vendorSub":"","productSub":"20030107","vendor":"Google Inc.","maxTouchPoints":0,"userActivation":{},"doNotTrack":null,"geolocation":{},"connection":{},"pdfViewerEnabled":true,"webkitTemporaryStorage":{},"webkitPersistentStorage":{},"hardwareConcurrency":24,"cookieEnabled":true,"appCodeName":"Mozilla","appName":"Netscape","appVersion":"5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36","platform":"Linux x86_64","product":"Gecko","userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36","language":"en-US","languages":["en-US"],"onLine":true,"webdriver":false,"scheduling":{},"clipboard":{},"credentials":{},"keyboard":{},"managed":{},"mediaDevices":{},"storage":{},"serviceWorker":{},"wakeLock":{},"deviceMemory":8,"ink":{},"hid":{},"locks":{},"mediaCapabilities":{},"mediaSession":{},"permissions":{},"presentation":{},"serial":{},"virtualKeyboard":{},"usb":{},"xr":{},"userAgentData":{"brands":[{"brand":" Not A;Brand","version":"99"},{"brand":"Chromium","version":"101"}],"mobile":false},"plugins":["internal-pdf-viewer","internal-pdf-viewer","internal-pdf-viewer","internal-pdf-viewer","internal-pdf-viewer"]},"dr":"","inv":true,"exec":false,"wn":[],"wn-mp":0,"xy":[],"xy-mp":0,"lpt":1652126817445,"mm":[[799,371,1652126821823],[769,387,1652126821839],[656,444,1652126822026],[647,447,1652126822043],[642,449,1652126822061],[639,450,1652126822180],[638,450,1652126822197],[638,451,1652126822216],[634,454,1652126822233],[625,457,1652126822249],[611,461,1652126822266],[595,463,1652126822282],[581,465,1652126822299],[567,465,1652126822315],[554,467,1652126822331],[543,467,1652126822348],[535,467,1652126822365],[528,467,1652126822382],[522,466,1652126822399],[517,463,1652126822419],[516,462,1652126822544],[515,461,1652126822739],[512,458,1652126822755],[509,453,1652126822772],[507,449,1652126822788],[503,444,1652126822804],[503,445,1652126823786],[522,459,1652126823802],[539,467,1652126823818],[558,473,1652126823834],[576,480,1652126823850],[594,485,1652126823866],[611,491,1652126823882],[628,494,1652126823898],[648,494,1652126823914],[671,493,1652126823930],[697,487,1652126823946],[729,481,1652126823962],[762,470,1652126823978],[794,457,1652126823994],[799,397,1652126826165],[784,399,1652126826181],[768,399,1652126826197],[750,399,1652126826213],[728,401,1652126826229],[706,405,1652126826245],[684,409,1652126826261],[662,416,1652126826277],[643,422,1652126826293],[625,430,1652126826309],[608,438,1652126826325]],"mm-mp":15.23956723338483},"v":1}' && JSON.stringify({
                'st': now, // 1651885779270,
                'dct': now, // 1651885779270,
                'mm': mm,
                'mm-mp': this.getMeanPeriod(mm),
                'md': md,
                'md-mp': this.getMeanPeriod(md),
                'mu': mu,
                'mu-mp': this.getMeanPeriod(mu),
                'topLevel': {
                    'inv': false,
                    'st': Date.now() - 5000, // 1651884804192,
                    'sc': {
                        'availWidth': 1920,
                        'availHeight': 1036,
                        'width': 1920,
                        'height': 1080,
                        'colorDepth': 24,
                        'pixelDepth': 24,
                        'availLeft': 0,
                        'availTop': 0,
                        'onchange': null,
                        'isExtended': false
                    },
                    'nv': {
                        'vendorSub': '',
                        'productSub': '20030107',
                        'vendor': 'Google Inc.',
                        'maxTouchPoints': 0,
                        'userActivation': {},
                        'doNotTrack': null,
                        'geolocation': {},
                        'connection': {},
                        'pdfViewerEnabled': true,
                        'webkitTemporaryStorage': {},
                        'webkitPersistentStorage': {},
                        'hardwareConcurrency': 4,
                        'cookieEnabled': true,
                        'appCodeName': 'Mozilla',
                        'appName': 'Netscape',
                        'appVersion': '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36',
                        'platform': 'Win32',
                        'product': 'Gecko',
                        'userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36',
                        'language': 'en-US',
                        'languages': ['en-US', 'en'],
                        'onLine': true,
                        'webdriver': false,
                        'scheduling': {},
                        'clipboard': {},
                        'credentials': {},
                        'keyboard': {},
                        'managed': {},
                        'mediaDevices': {},
                        'storage': {},
                        'serviceWorker': {},
                        'wakeLock': {},
                        'deviceMemory': 8,
                        'ink': {},
                        'hid': {},
                        'locks': {},
                        'mediaCapabilities': {},
                        'mediaSession': {},
                        'permissions': {},
                        'presentation': {},
                        'serial': {},
                        'virtualKeyboard': {},
                        'usb': {},
                        'xr': {},
                        'userAgentData': {
                            'brands': [{
                                'brand': 'Google Chrome',
                                'version': '101'
                            }, {
                                'brand': 'Chromium',
                                'version': '101'
                            }, {
                                'brand': ';Not A Brand',
                                'version': '99'
                            }],
                            'mobile': false
                        },
                        'plugins': ['internal-pdf-viewer', 'internal-pdf-viewer', 'internal-pdf-viewer', 'internal-pdf-viewer', 'internal-pdf-viewer']
                    },
                    'dr': '',
                    'exec': false,
                    'wn': [],
                    'wn-mp': 0,
                    'xy': [],
                    'xy-mp': 0,
                    'mm': nv_mm,
                    'mm-mp': this.getMeanPeriod(nv_mm),
                    'lpt': now, // 1651884925375
                },
                'v': 1
            }),
            'n': encoded,
            'serverdomain': this.host,
            'sitekey': this.sitekey,
            'v': this.version
        };

        //console.log(body);

        const { data } = await axios.post('https://hcaptcha.com/checkcaptcha/' + info.key, body, {
            httpsAgent: agent,
            validateStatus: null,
            params: {
                s: this.sitekey
            },
            headers: {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/json;charset=UTF-8',
                'origin': 'https://newassets.hcaptcha.com',
                'referer': 'https://newassets.hcaptcha.com/',
                /*'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="101"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',*/
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36'
            }
        });

        return data;
    }

    async getCaptcha(agent, now, config) {
        //console.time(now);
        let encoded = await hash(config.c.req);
        //console.timeEnd(now);

        let mm = this.randomize(now, [[155, 8, 1651884804525], [150, 14, 1651884804542], [144, 23, 1651884804558], [136, 35, 1651884804574], [132, 44, 1651884804592], [129, 44, 1651884804640]]);

        let nv_mm = this.randomize(now, [[598, 258, 1651884804208], [584, 262, 1651884804225], [573, 265, 1651884804241], [557, 272, 1651884804257], [536, 289, 1651884804273], [517, 314, 1651884804289], [503, 337, 1651884804306], [487, 359, 1651884804324], [471, 377, 1651884804340], [453, 402, 1651884804356], [438, 435, 1651884804372], [430, 470, 1651884804388], [427, 493, 1651884804404], [424, 502, 1651884804420], [421, 504, 1651884804440], [418, 507, 1651884804456], [414, 514, 1651884804473]]);

        let instance = 0;
        let id = instance + Math.random().toString(36).slice(2);
        instance++;

        let body = {
            v: this.version,
            sitekey: this.sitekey,
            host: this.host,
            hl: 'en',
            motionData: '{"st":1652126815938,"mm":[[194,0,1652126816562],[174,9,1652126816578],[164,16,1652126816595],[159,19,1652126816611],[153,22,1652126816627],[145,28,1652126816643],[136,30,1652126816660],[134,31,1652126816680],[140,33,1652126816697],[147,34,1652126816714],[149,34,1652126817034],[154,35,1652126817050],[162,36,1652126817066],[174,37,1652126817082],[191,34,1652126817098],[216,27,1652126817114],[247,20,1652126817130],[282,16,1652126817146],[301,30,1652126821852],[270,45,1652126821868],[249,56,1652126821884],[233,65,1652126821901],[222,70,1652126821917],[217,72,1652126821935],[216,72,1652126821982],[214,74,1652126821999],[208,77,1652126822017],[53,77,1652126822811],[49,69,1652126822828],[46,63,1652126822844],[40,56,1652126822860],[37,50,1652126822883],[36,50,1652126822975],[35,46,1652126822991],[34,43,1652126823025]],"mm-mp":22.44097222222222,"md":[[34,43,1652126823460]],"md-mp":0,"mu":[[34,43,1652126823555]],"mu-mp":0,"v":1,"topLevel":{"st":1652126815558,"sc":{"availWidth":1920,"availHeight":1036,"width":1920,"height":1080,"colorDepth":24,"pixelDepth":24,"availLeft":0,"availTop":0,"onchange":null,"isExtended":false},"nv":{"vendorSub":"","productSub":"20030107","vendor":"Google Inc.","maxTouchPoints":0,"userActivation":{},"doNotTrack":null,"geolocation":{},"connection":{},"pdfViewerEnabled":true,"webkitTemporaryStorage":{},"webkitPersistentStorage":{},"hardwareConcurrency":24,"cookieEnabled":true,"appCodeName":"Mozilla","appName":"Netscape","appVersion":"5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36","platform":"Linux x86_64","product":"Gecko","userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36","language":"en-US","languages":["en-US"],"onLine":true,"webdriver":false,"scheduling":{},"clipboard":{},"credentials":{},"keyboard":{},"managed":{},"mediaDevices":{},"storage":{},"serviceWorker":{},"wakeLock":{},"deviceMemory":8,"ink":{},"hid":{},"locks":{},"mediaCapabilities":{},"mediaSession":{},"permissions":{},"presentation":{},"serial":{},"virtualKeyboard":{},"usb":{},"xr":{},"userAgentData":{"brands":[{"brand":" Not A;Brand","version":"99"},{"brand":"Chromium","version":"101"}],"mobile":false},"plugins":["internal-pdf-viewer","internal-pdf-viewer","internal-pdf-viewer","internal-pdf-viewer","internal-pdf-viewer"]},"dr":"","inv":true,"exec":false,"wn":[[800,962,1,1652126815559]],"wn-mp":0,"xy":[[0,0,1,1652126815559]],"xy-mp":0,"lpt":1652126817445,"mm":[[787,315,1652126816474],[754,326,1652126816490],[724,335,1652126816506],[692,345,1652126816524],[666,355,1652126816540],[645,364,1652126816556],[761,377,1652126817161],[799,371,1652126821823],[769,387,1652126821839],[656,444,1652126822026],[647,447,1652126822043],[642,449,1652126822061],[639,450,1652126822180],[638,450,1652126822197],[638,451,1652126822216],[634,454,1652126822233],[625,457,1652126822249],[611,461,1652126822266],[595,463,1652126822282],[581,465,1652126822299],[567,465,1652126822315],[554,467,1652126822331],[543,467,1652126822348],[535,467,1652126822365],[528,467,1652126822382],[522,466,1652126822399],[517,463,1652126822419],[516,462,1652126822544],[515,461,1652126822739],[512,458,1652126822755],[509,453,1652126822772],[507,449,1652126822788],[503,444,1652126822804]],"mm-mp":22.533807829181487},"session":[],"widgetList":["09iml30cw9zd","1dhbo1icskm"],"widgetId":"09iml30cw9zd","href":"https://onlyfans.com/","prev":{"escaped":false,"passed":false,"expiredChallenge":false,"expiredResponse":false}}' || JSON.stringify({
                'st': now + 330, // 1651884804522
                'mm': mm,
                'mm-mp': this.getMeanPeriod(mm),
                'md': this.randomize(now, [[129, 42, 1651884804700]]),
                'md-mp': 0,
                'mu': this.randomize(now, [[129, 42, 1651884804765]]),
                'mu-mp': 0,
                'v': 1,
                'topLevel': {
                    'inv': false,
                    'st': now, // 1651884804192,
                    'sc': {
                        'availWidth': 1920,
                        'availHeight': 1036,
                        'width': 1920,
                        'height': 1080,
                        'colorDepth': 24,
                        'pixelDepth': 24,
                        'availLeft': 0,
                        'availTop': 0,
                        'onchange': null,
                        'isExtended': false
                    },
                    'nv': {
                        'vendorSub': '',
                        'productSub': '20030107',
                        'vendor': 'Google Inc.',
                        'maxTouchPoints': 0,
                        'userActivation': {},
                        'doNotTrack': null,
                        'geolocation': {},
                        'connection': {},
                        'pdfViewerEnabled': true,
                        'webkitTemporaryStorage': {},
                        'webkitPersistentStorage': {},
                        'hardwareConcurrency': 4,
                        'cookieEnabled': true,
                        'appCodeName': 'Mozilla',
                        'appName': 'Netscape',
                        'appVersion': '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36',
                        'platform': 'Win32',
                        'product': 'Gecko',
                        'userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36',
                        'language': 'en-US',
                        'languages': ['en-US', 'en'],
                        'onLine': true,
                        'webdriver': false,
                        'scheduling': {},
                        'clipboard': {},
                        'credentials': {},
                        'keyboard': {},
                        'managed': {},
                        'mediaDevices': {},
                        'storage': {},
                        'serviceWorker': {},
                        'wakeLock': {},
                        'deviceMemory': 8,
                        'ink': {},
                        'hid': {},
                        'locks': {},
                        'mediaCapabilities': {},
                        'mediaSession': {},
                        'permissions': {},
                        'presentation': {},
                        'serial': {},
                        'virtualKeyboard': {},
                        'usb': {},
                        'xr': {},
                        'userAgentData': {
                            'brands': [{
                                'brand': 'Google Chrome',
                                'version': '101'
                            }, {
                                'brand': 'Chromium',
                                'version': '101'
                            }, {
                                'brand': ';Not A Brand',
                                'version': '99'
                            }],
                            'mobile': false
                        },
                        'plugins': ['internal-pdf-viewer', 'internal-pdf-viewer', 'internal-pdf-viewer', 'internal-pdf-viewer', 'internal-pdf-viewer']
                    },
                    'dr': '',
                    'exec': false,
                    'wn': this.randomize(now, [[800, 962, 1, 1651884804205]]),
                    'wn-mp': 0,
                    'xy': this.randomize(now, [[0, 0, 1, 1651884804206]]),
                    'xy-mp': 0,
                    'mm': nv_mm,
                    'mm-mp': this.getMeanPeriod(nv_mm)
                },
                'session': [],
                'widgetList': [id],
                'widgetId': id,
                'href': this.href,
                'prev': {
                    'escaped': false,
                    'passed': false,
                    'expiredChallenge': false,
                    'expiredResponse': false
                }
            }),
            n: encoded,
            c: JSON.stringify(config.c)
        };

        const { data } = await axios.post('https://hcaptcha.com/getcaptcha', new URLSearchParams(body), {
            httpsAgent: agent,
            validateStatus: null,
            params: {
                s: this.sitekey
            },
            headers: {
                'accept': 'application/json',
                'accept-encoding': 'gzip, deflate, br',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://newassets.hcaptcha.com',
                'referer': 'https://newassets.hcaptcha.com/',
                /*'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="101"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',*/
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36'
            }
        });

        return data;
    }

    async checkSiteConfig(agent) {
        const { data } = await axios.post('https://hcaptcha.com/checksiteconfig', null, {
            httpsAgent: agent,
            validateStatus: null,
            params: {
                v: this.version,
                host: this.host,
                sitekey: this.sitekey,
                sc: 1,
                swa: 1
            },
            headers: {
                'accept': 'application/json',
                'accept-encoding': 'gzip, deflate, br',
                'accept-language': 'en-US,en;q=0.9',
                'content-length': '0',
                'content-type': 'text/plain',
                'origin': 'https://newassets.hcaptcha.com',
                'referer': 'https://newassets.hcaptcha.com/',
                /*'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="101"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',*/
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36'
            }
        });

        return data;
    }

    async getVersion() {
        let { data } = await axios.get('https://hcaptcha.com/1/api.js');
        let regex = /https:\/\/newassets.hcaptcha.com\/captcha\/v1\/(\w+)\/static/;
        return data.match(regex)[1];
    }
}

module.exports = Client;
