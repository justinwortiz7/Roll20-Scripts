/**
 * Randomized Loot Distributor (RLD)
 * 
 * Automatically distributes loot from player-specific rollable tables to a random eligible party member.
 * 
 * Features:
 * - Selects a random character marked "In Party" (ignoring NPCs/Summons).
 * - Rolls from a table named "[FirstName] [Suffix]" (e.g., "John-items").
 * - Delivers the result via a whisper to the selected player.
 * - Configurable via chat commands.
 * 
 * Usage:
 * - !whogetsit : Roll for a random player.
 * - !whogetsit title "New Title" : Set the output template title.
 * - !whogetsit suffix "-suffix" : Set the table name suffix.
 * - !whogetsit reset : Reset configuration to defaults.
 * - !whogetsit help : Show help message.
 * 
 * Requirements:
 * 1. Characters must have "In Party" checked.
 * 2. Characters tagged "summon" or "npc" are ignored.
 * 3. Rollable Tables must exist with the pattern "[FirstName] [Suffix]".
 * 
 * @module RandomizedLootDistributor
 */
const RandomizedLootDistributor = (function () {
    const API_NAME = 'RandomizedLootDistributor';
    const VERSION = '2.0';
    const UPDATE_DATE = '2026-06-03';

    const DEFAULT_STATE = {
        version: VERSION,
        updateDate: UPDATE_DATE,
        args: {
            outputTitleKeyword: 'title',
            tableSuffixKeyword: 'suffix',
            resetKeyword: 'reset'
        },
        config: {
            outputTemplateTitle: '(From Randomized Loot Distributor)',
            rollableTableNameSuffix: '-items'
        }
    };

    /**
     * Initializes the module on Roll20 ready.
     * Sets up default state if not present and logs readiness.
     */
    const onReady = function () {
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

        const currentVersion = state[API_NAME].version;
        const currentUpdate = state[API_NAME].updateDate;
        log(`🚀 ${API_NAME} v${currentVersion} Ready! (Updated: ${currentUpdate})`);
    };

    /**
     * Handles incoming API chat messages.
     * Routes commands to specific handlers based on content.
     * 
     * @param {Object} msg - The chat message object from Roll20.
     */
    const onChatMessage = function (msg) {
        if (msg.type !== 'api' || !msg.content.startsWith('!whogetsit')) return;

        const args = msg.content.trim().split(/\s+/).slice(1);

        if (args.length === 0) {
            handleDistribution();
            return;
        }

        const configArgs = Object.values(state[API_NAME].args);
        const hasConfigArg = args.some(arg => configArgs.includes(arg.toLowerCase()));

        if (hasConfigArg) {
            handleConfigCommand(args);
        } else {
            handleHelpCommand();
        }
    };

    /**
     * Handles configuration updates (title, suffix, reset).
     * 
     * @param {string[]} args - The command arguments.
     */
    const handleConfigCommand = function (args) {
        const config = state[API_NAME].config;
        const supportedArgs = state[API_NAME].args;
        const updates = [];

        for (let i = 0; i < args.length; i++) {
            const currentArg = args[i].toLowerCase();

            if (currentArg === supportedArgs.resetKeyword) {
                state[API_NAME] = { ...DEFAULT_STATE };
                updates.push('✅ Config reset to defaults.');
                break;
            }

            if (currentArg === supportedArgs.outputTitleKeyword && (i + 1) < args.length) {
                const oldValue = config.outputTemplateTitle;
                const newValue = args[i + 1];
                state[API_NAME].config.outputTemplateTitle = newValue;
                updates.push(`✅ Template Title updated from "${oldValue}" to "${newValue}"`);
                i++; // Skip next arg
            }
            else if (currentArg === supportedArgs.tableSuffixKeyword && (i + 1) < args.length) {
                const oldValue = config.rollableTableNameSuffix;
                const newValue = args[i + 1];
                state[API_NAME].config.rollableTableNameSuffix = newValue;
                updates.push(`✅ Table Suffix updated from "${oldValue}" to "${newValue}"`);
                i++; // Skip next arg
            }
        }

        if (updates.length > 0) {
            const message = updates.join('\n');
            sendChat(API_NAME, `/w gm &{template:default}{{name=Configuration}}{{message(s)=${message}}}`);
        } else {
            handleHelpCommand();
            log(`⚠️ [RLD] Invalid config command.`);
        }
    };

    /**
     * Displays the help message with current configuration.
     */
    const handleHelpCommand = function () {
        const config = state[API_NAME].config;
        const helpMessage = `📜 **Randomized Loot Distributor (RLD)**
Current Config:
- Template Title: "${config.outputTemplateTitle}"
- Table Suffix: "${config.rollableTableNameSuffix}"

**Commands**:
!whogetsit : Distribute loot to random player
!whogetsit title "NewName" : Set template title
!whogetsit suffix "-items" : Set table suffix
!whogetsit reset : Reset to defaults
!whogetsit help : View this message`;

        sendChat(API_NAME, `/w gm &{template:default}{{name=Help}}${helpMessage}`);
    };

    /**
     * Executes the main logic: selects a random player and rolls their loot table.
     */
    const handleDistribution = function () {
        const config = state[API_NAME].config;
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

        const rollString = `[[1t[${tableName}]]]`;
        sendChat(API_NAME, `&{template:default}{{name=${config.outputTemplateTitle}}}{{recipient=${selectedName}}}{{item=${rollString}}}`);
    };

    /**
     * Retrieves a list of first names for characters in the party.
     * Excludes characters tagged 'summon' or 'npc'.
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
            if (tags.includes('summon') || tags.includes('npc')) continue;

            // Extract first name
            const spaceIndex = fullName.indexOf(' ');
            const firstName = spaceIndex !== -1 ? fullName.substring(0, spaceIndex) : fullName;
            names.push(firstName);
        }

        return names;
    };

    // Register Event Listeners
    on('ready', onReady);
    on('chat:message', onChatMessage);
})();