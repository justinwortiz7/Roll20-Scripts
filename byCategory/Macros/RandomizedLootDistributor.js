/**
 * Automatically distributes loot from player-specific rollable tables to a random eligible party member.
 */
const RandomizedLootDistributor = (function () {
    const API_NAME = 'RandomizedLootDistributor';
    const VERSION = '2.1';
    const UPDATE_DATE = '2026-06-09';

    const DEFAULT_STATE = {
        outputTemplateTitle: API_NAME,
        rollableTableNameSuffix: '-items',
        ignore: ['summon', 'npc']
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
            if (tags.some(tag => tagsToIgnore.includes(tag))) continue;

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

        for (let argumentIndex = 0; argumentIndex < args.length; argumentIndex++) {
            const argument = args[argumentIndex].toLowerCase();

            if (argument === 'reset') {
                state[API_NAME] = { ...DEFAULT_STATE };
                updates.push('{{✅ Config=Reset to defaults successful.}}');
                break; // Stop processing args
            }

            const thisIsTheLastArgument = (argumentIndex + 1) >= args.length;
            if (thisIsTheLastArgument)
                break;

            const newConfigValue = args[argumentIndex + 1].replaceAll('"', '');
            let oldConfigValue = undefined;
            switch (argument) {
                case 'title':
                    oldConfigValue = config.outputTemplateTitle;
                    state[API_NAME].outputTemplateTitle = newConfigValue;
                    updates.push(`{{✅ Title="${oldConfigValue}" updated to "${newConfigValue}"}}`);
                    argumentIndex++;
                    break;
                case 'suffix':
                    oldConfigValue = config.rollableTableNameSuffix;
                    state[API_NAME].rollableTableNameSuffix = newConfigValue;
                    updates.push(`{{✅ Suffix="${oldConfigValue}" updated to "${newConfigValue}"}}`);
                    argumentIndex++;
                    break;
                case 'ignore':
                    const tagsToIgnore = state[API_NAME].ignore;
                    tagsToIgnore.push(newConfigValue);
                    updates.push(`{{✅ Now Ignoring="${tagsToIgnore.join(', ')}"}}`);
                    argumentIndex++;
                    break;
                case 'help':
                    continue;
                default:
                    log(`${API_NAME}: Skipping unsupported configuration argument '${argument}'`);
                    break;
            }
        }

        if (updates.length > 0) {
            sendChat(API_NAME, `/w gm &{template:default}{{name=Configuration}}${updates.join('')}`);
            return;
        }

        handleHelpCommand();
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

    /**
     * Displays the help message and current configuration.
     */
    const handleHelpCommand = function () {
        const config = state[API_NAME];

        const currentConfig = `{{Template Title="${config.outputTemplateTitle}"}}{{Table Suffix="${config.rollableTableNameSuffix}"}}{{Exclude Characters with Tags=${config.ignore.join(', ')}}}`;
        sendChat(API_NAME, `/w gm &{template:default}{{name=Current Configuration}}${currentConfig}`);

        const commands = `{{Distribute loot to random player=!whogetsit}}{{Set template title=!rld title "NewName"}}{{Set table suffix=!rld suffix "-items"}}{{Add Exclusion Tags=!rld ignore "tag"}}{{Reset to defaults=!rld reset}}`;
        sendChat(API_NAME, `/w gm &{template:default}{{name=Commands}}${commands}`);
    };

    on('chat:message', () => {
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