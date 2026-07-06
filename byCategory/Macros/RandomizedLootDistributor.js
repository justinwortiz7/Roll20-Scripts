/**
 * Automatically distributes loot from player-specific rollable tables to a random eligible party member.
 */
const RandomizedLootDistributor = (function () {
    const API_NAME = 'RandomizedLootDistributor';
    const VERSION = '2.2';
    const UPDATE_DATE = '2026-07-06';

    const DEFAULT_STATE = {
        outputTemplateTitle: API_NAME,
        rollableTableNameSuffix: '-items',
        ignore: ['summon', 'npc']
    };

    const displayCommandHelp = function () {
        const commands = `{{Distribute loot to random player=!whogetsit\n!rld}}{{Set template title=!rld title "NewName"}}{{Set table suffix=!rld suffix "-items"}}{{Add Exclusion Tags=!rld ignore "tag"}}{{Reset to defaults=!rld reset}}`;
        sendChat(API_NAME, `/w gm &{template:default}{{name=Commands}}${commands}`);
    };

    const displayCurrentConfig = function () {
        const config = state[API_NAME];
        const currentConfig = `{{Template Title="${config.outputTemplateTitle}"}}{{Table Suffix="${config.rollableTableNameSuffix}"}}{{Exclude Characters with Tags=${config.ignore.join(', ')}}}`;
        sendChat(API_NAME, `/w gm &{template:default}{{name=Current Configuration}}${currentConfig}`);
    };

    /**
     * Retrieves a list of first names for characters in the party, excluding 
     * characters tagged with the configured ignore tags.
     * 
     * @returns {string[]} Array of character first names.
     */
    const getPlayerCharacterNames = function () {
        const characters = findObjs({ type: 'character', inParty: true });
        const names = [];

        for (const char of characters) {
            const fullName = char.get('name');
            if (!fullName || fullName.trim() === '') continue;

            const tags = char.get('tags') || [];
            const tagsToIgnore = state[API_NAME].ignore;
            let ignoreCharacter = false;
            for (const tag of tags) {
                if (tagsToIgnore.includes(tag)) {
                    ignoreCharacter = true;
                    break;
                }
            }
            if (ignoreCharacter) continue;

            // Extract first name
            const spaceIndex = fullName.indexOf(' ');
            const firstName = spaceIndex !== -1 ? fullName.substring(0, spaceIndex) : fullName;
            names.push(firstName);
        }

        return names;
    };

    /**
     * Handles configuration updates.
     * 
     * @param {string[]} args
     */
    const handleConfigCommand = function (args) {
        const config = state[API_NAME];
        const updates = [];
        const configMap = {
            title: (val) => {
                const old = config.outputTemplateTitle;
                state[API_NAME].outputTemplateTitle = val;
                return `{{✅ Title="${old}" updated to "${val}"}}`;
            },
            suffix: (val) => {
                const old = config.rollableTableNameSuffix;
                state[API_NAME].rollableTableNameSuffix = val;
                return `{{✅ Suffix="${old}" updated to "${val}"}}`;
            },
            ignore: (val) => {
                config.ignore.push(val);
                return `{{✅ Now Ignoring="${config.ignore.join(', ')}"}}`;
            }
        };

        for (let argumentIndex = 0; argumentIndex < args.length; argumentIndex++) {
            const argument = args[argumentIndex].toLowerCase();
            if (argument === 'reset') {
                state[API_NAME] = { ...DEFAULT_STATE };
                updates.push('{{✅ Config=Reset to defaults successful.}}');
                break;
            } else if (argument === 'help') {
                displayCommandHelp();
                return;
            } else if (argument === 'config') {
                displayCurrentConfig();
                return;
            } else if (configMap[argument] && args[argumentIndex + 1]) {
                updates.push(configMap[argument](args[++argumentIndex].replaceAll('"', '')));
            } else {
                log(`${API_NAME}: Skipping unsupported configuration argument '${argument}'`);
            }
        }

        if (updates.length > 0) {
            sendChat(API_NAME, `/w gm &{template:default}{{name=Configuration}}${updates.join('')}`);
            return;
        }
    };

    /**
     * Selects a random player in the currently defined party and rolls their loot table.
     */
    const handleDistribution = function () {
        const config = state[API_NAME];
        const playerNames = getPlayerCharacterNames();

        if (!playerNames || playerNames.length === 0) {
            sendChat(API_NAME, `/w gm &{template:default}{{name=Error}}{{message=❌ No eligible players found in the party.}}`);
            return;
        }

        const randomIndex = Math.floor(Math.random() * playerNames.length);
        const selectedName = playerNames[randomIndex];
        const tableName = `${selectedName}${config.rollableTableNameSuffix}`;

        const tables = findObjs({ type: 'rollabletable', name: tableName });

        if (!tables || tables.length === 0) {
            sendChat(API_NAME, `/w gm &{template:default}{{name=Error}}{{message=❌ Table '${tableName}' not found for player '${selectedName}'.}}`);
            return;
        }

        sendChat(API_NAME, `&{template:default}{{name=${config.outputTemplateTitle}}}{{recipient=${selectedName}}}{{item=[[1t[${tableName}]]]}}`);
    };

    on('chat:message', (chatMessage) => {
        const isValidCommand = chatMessage.content.startsWith('!whogetsit') || chatMessage.content.startsWith('!rld');
        if (chatMessage.type !== 'api' || !isValidCommand) return;

        const args = chatMessage.content.trim().match(/(?:[^\s"]+|"[^"]*")+/g).slice(1);

        if (args.length === 0) {
            handleDistribution();
            return;
        }

        handleConfigCommand(args);
    });

    on('ready', () => {
        if (!state[API_NAME]) {
            state[API_NAME] = { ...DEFAULT_STATE };
        } else {
            const config = state[API_NAME];
            // Ensure all default keys exist
            for (const key in DEFAULT_STATE) {
                if (config[key] === undefined) {
                    config[key] = DEFAULT_STATE[key];
                }
            }
        }

        log(`🚀 ${API_NAME} v${VERSION} Ready! (Updated: ${UPDATE_DATE})`);
    });
})();