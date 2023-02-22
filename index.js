const path = require('path');
const express = require('express')
const app = express()
const pug = require('pug');
const port = 3000


var bots = []

const SERVER_MAX_CAPACITY = 20;
const SINGLE_BOTS_BATCH_SIZE = 20;
const EACH_SERVER_BOTS_ONE_TIME = 10;
const PLACE_HOLDER = 10;


app.use(express.static(path.join(__dirname, '/public')));

const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();

kc.loadFromDefault()


const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

// list game servers
app.get('/gameservers', (req, res) => {
    getGameServers(function (gs) {
        res.send(gs)
    })
})

// render index page
app.get("/", (req, res) => {
    getGameServers(function (gs) {
        res.send(pug.renderFile(path.join(__dirname, '/index.pug'), {gameservers: gs}))
    })
})

// listen port 
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})


app.get('/scaleout', (req, res) => {
    var one_batch = SINGLE_BOTS_BATCH_SIZE
    var total_capacity = 0;
    var total_user = 0;

    getGameServers(function (gs) {
        for (i = 0; i < gs.length; i++) {
            for (j = 0; j < EACH_SERVER_BOTS_ONE_TIME; j++) {
                if (one_batch <= 0) {
                    break;
                }
                var added = addBotToServer(gs[i]);
                if (added && one_batch >= 1) {
                    one_batch--;
                    // add bot to count
                    gs[i].count++;
                    continue
                }
            }
            total_user += gs[i].count
        }

        if (one_batch == 0) {
            console.log("all bots has joined the game.")
        } else {
            console.log(one_batch + " can't joined the game.")
        }

        total_capacity = gs.length * SERVER_MAX_CAPACITY

        console.log("total_capacity: " + total_capacity + " total_user: " + total_user)
        if (total_capacity <= (total_user + PLACE_HOLDER) || one_batch > 0) {
            console.log("need scale up more game server.")

            var body = [{"op": "replace", "path": "/spec/replicas", "value": gs.length + 2}];

            const options = {"headers": {"Content-type": k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH}};

            customApi.patchNamespacedCustomObjectScale("game.kruise.io", "v1alpha1", "game-ns", "gameserversets", "minecraft", body, undefined, undefined, undefined, options)
                .then(() => {
                    console.log("Patched.")
                })
                .catch((err) => {
                    console.log("Error: Patch failed");
                    console.log(err)
                });
        }
    })
})

app.get("/scalein", (req, res) => {
    for (i = 0; i < bots.length; i++) {
        try {
            bots[i].quit();
        } catch (e) {
            continue
        }
    }
    delete bots;
    bots = [];
})

function getGameServers(f) {
    k8sApi.listNamespacedPod('game-ns').then((re) => {
        // res.send(re.body);
        var gameservers = re.body.items;
        var gs = []
        for (i = 0; i < gameservers.length; i++) {
            if (gameservers[i].metadata["labels"]["game.kruise.io/owner-gss"] == "minecraft") {
                gameservers[i].count = 0

                for (j = 0; j < bots.length; j++) {
                    if (bots[j].server == gameservers[i]["metadata"]["name"]) {
                        gameservers[i].count++;
                    }
                }
                gs.push(gameservers[i])
            }
        }
        f(gs)
    });
}


function addBotToServer(server) {

    // max user count exceed
    if (server.count >= SERVER_MAX_CAPACITY) {
        console.log("server :" + server["metadata"]["name"] + " has been full. Skip to next server.")
        return false
    }


    var mineflayer = require('mineflayer')
    bot = mineflayer.createBot({
        host: server["status"]["podIP"], // minecraft 服务器的 ip地址
        username: "Bot" + parseInt(Math.random() * 100000000), // minecraft 用户名
    })

    bot.server = server["metadata"]["name"]

    const armorTypes = {
        helmet: [0, 1.8, 0], chestplate: [0, 1.2, 0], leggings: [0, 0.75, 0], boots: [0, 0.1, 0]
    }

    bot.on('chat', async (username, message) => {
        const [mainCommand, subCommand] = message.split(' ')
        if (mainCommand !== 'equip' && mainCommand !== 'unequip') return

        const armorStand = bot.nearestEntity(e => e.mobType === 'Armor Stand' && bot.entity.position.distanceTo(e.position) < 4)
        if (!armorStand) {
            bot.chat('No armor stands nearby!')
            return
        }

        if (mainCommand === 'equip') {
            let armor = null
            // parse chat
            Object.keys(armorTypes).forEach(armorType => {
                if (subCommand !== armorType) return
                armor = bot.inventory.items().find(item => item.name.includes(armorType))
            })

            if (armor === null) {
                bot.chat('I have no armor items in my inventory!')
                return
            }

            await bot.equip(armor, 'hand')
            bot.activateEntityAt(armorStand, armorStand.position)
        } else if (mainCommand === 'unequip') {
            await bot.unequip('hand')

            const offset = armorTypes[subCommand]
            if (!offset) return

            bot.activateEntityAt(armorStand, armorStand.position.offset(...offset))
        }
    })

    //  记录错误和被踢出服务器的原因:
    bot.on('kicked', console.log)
    bot.on('error', console.log)

    bots.push(bot)

    return true
}
