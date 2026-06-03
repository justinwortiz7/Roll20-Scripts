/**
 * This script automatically creates a shadow token on the map layer for tokens
 * that are flying, which is determined by Bar 4 (default).
 */
const AutoDropShadow = (() => {
    const API_NAME = 'AutoDropShadow';
    const VERSION = '1.1';
    const UPDATE_DATE = '2026-06-03';

    const DEFAULT_STATE = {
        altitudeKey: 'bar4_value',
        prefabId: null,
        sourcesToShadowsMap: {},
        tag: 'ignore'
    };

    /**
     * Creates a shadow graphic/token object.
     * @param {any} sourceObj The Roll20 object casting the shadow.
     * @param {string} layer
     * @param {string} offsetInPixels
     */
    const createShadow = function (sourceObj, layer, offsetInPixels) {
        const config = state[API_NAME];
        const prefabId = config.prefabId;

        if (!prefabId) return;

        const tag = config.tag;
        const prefab = getObj('graphic', prefabId);
        const prefabImage = prefab.get('imgsrc');

        const newShadow = createObj('graphic', {
            type: 'graphic',
            subtype: 'token',
            pageid: sourceObj.get('pageid'),
            left: sourceObj.get('left'),
            top: sourceObj.get('top') + offsetInPixels,
            width: sourceObj.get('width'),
            height: sourceObj.get('height'),
            imgsrc: prefabImage,
            layer: layer,
            name: sourceObj.get('name') + '\'s Shadow',
            bar1_max: 0,
            bar2_max: 0,
            bar3_max: 0,
            bar4_max: 0,
            tags: [tag]
        });

        if (newShadow) {
            const sourceObjId = sourceObj.get('_id');
            state[API_NAME].sourcesToShadowsMap[sourceObjId] = newShadow.get('_id');
        }
    }

    /**
     * Calculates the number of pixels per grid unit using the page 'square_size' and 'scale_number'.
     * @param {any} pageId The Roll20 page id.
     * @returns {number}
     */
    const getPixelsPerGridUnit = function (pageId) {
        const page = getObj('page', pageId);
        if (!page) return 14;
        let squareSize = page.get('square_size');
        squareSize = squareSize ? parseInt(squareSize, 10) : 70;
        let scale = page.get('scale_number');
        scale = scale ? parseInt(scale, 10) : 5;
        return Math.max(squareSize / scale, 14);
    }

    /**
     * Scans chat messages for supported commands.
     * @param {any} message Roll20 game chat message.
     */
    const handleConfigInput = function (message) {
        if (message.type !== 'api') return;

        const content = message.content ? message.content.toLowerCase() : "";
        const config = state[API_NAME];
        const apiCommandPrefix = `!ads`;

        if (!content.startsWith(apiCommandPrefix)) return;

        if (content.includes('help')) {
            const advancedUsageMessage = `
            * reset: Remove all managed shadows and reset the configuration.
            * altitude: Set the token attribute to be used for altitude. Example: ${apiCommandPrefix} altitude bar1_value
            * tag: Set the tag used to ignore shadow management. Example: ${apiCommandPrefix} tag lightsource
            `;
            sendChat(API_NAME, `/w gm &{template:default}{{name=Auto Drop Shadow Advanced Commands}}{{desc=${advancedUsageMessage}}}`);

            const basicUsageMessage = `
            1. Select a token to use as a shadow.
            2. Send '${apiCommandPrefix}' in the chat.
          3.a. Set **${config.altitudeKey}** != 0, then a copy of the shadow will be created and automatically follow the flying token.
          3.b. Set **${config.altitudeKey}** == 0 to remove the corresponding shadow.`;
            sendChat(API_NAME, `/w gm &{template:default}{{name=Auto Drop Shadow Basic Usage}}{{desc=${basicUsageMessage}}}`);
            return;
        }

        const isAltitudeConfig = content.includes('altitude');
        const isTagConfig = content.includes('tag');
        if (isAltitudeConfig || isTagConfig) {
            const argument = content.split(' ').at(-1);
            if (isAltitudeConfig) {
                config.altitudeKey = argument;
                sendChat(API_NAME, `/w gm 🔧🫡 ${argument} will now be used for the altitude value.`);
            } else {
                updateTags(config.tag, argument);
                sendChat(API_NAME, `/w gm 🔧🫡 Tags successfully updated to ${argument}.`);
            }
            return;
        }

        if (content.includes('reset')) {
            removeAllManagedShadows();
            resetConfiguration();
            sendChat(API_NAME, `/w gm 🔧🫡 Removed all shadows and reset configuration.`);
            return;
        }

        if (!message.selected || message.selected.length === 0) {
            sendChat(API_NAME, `/w gm ❌😒 No token selected.`);
            return;
        }

        const tokenId = message.selected[0]._id;
        const token = getObj('graphic', tokenId);

        if (!token) {
            sendChat(API_NAME, '/w gm ❌🤔 Token not found.');
            return;
        }

        const tag = config.tag;
        const currentTags = token.tags || [];

        // Ensure the prefab has the appropriate tags
        if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            token.tags = currentTags;
        }

        const newTop = 0 - token.get('height');
        token.set({
            name: 'Prefab Drop Shadow',
            layer: 'gmlayer',
            left: 0,
            top: newTop
        });

        state[API_NAME].prefabId = tokenId;
        sendChat(API_NAME, `/w gm 🔧🫡 Prefab set to: <b>${token.get('name')}</b>(${tokenId}).`);
    }

    /**
     * Adjusts managed shadows based on the altitude or position update
     * for a given object.
     * @param {any} currentObjState Roll20 object being modified.
     * @param {any} prevObjState Previous state of the Roll20 object.
     */
    const handleGraphicChange = function (currentObjState, prevObjState) {
        const config = state[API_NAME];
        const tag = config.tag;
        const currentTags = currentObjState.get('tags') || [];

        // Ignore if it's a shadow
        if (currentTags.includes(tag)) return;

        const altitudeKey = config.altitudeKey;
        const currentAltitude = currentObjState.get(altitudeKey);
        const prevAltitude = prevObjState[altitudeKey];
        const isAltitudeChange = prevAltitude !== currentAltitude;

        const isPositionChange = prevObjState.left !== currentObjState.left || prevObjState.top !== currentObjState.top;

        if (isAltitudeChange || isPositionChange) {
            updateShadow(currentObjState, currentAltitude);
        }
    }

    /**
     * If the removed object is the source for a managed shadow,
     * the shadow will also be removed.
     * @param {any} removedObj Roll20 object that is being removed from the game.
     */
    const handleGraphicRemoval = function (removedObj) {
        const sourcesToShadowsMap = state[API_NAME].sourcesToShadowsMap;
        const removedObjId = removedObj.get('_id');

        if (Object.prototype.hasOwnProperty.call(sourcesToShadowsMap, removedObjId)) {
            const shadowId = sourcesToShadowsMap[removedObjId];
            const shadow = getObj('graphic', shadowId);
            if (shadow) shadow.remove();
            delete sourcesToShadowsMap[removedObjId];
        }
    }

    /**
     * Initializes the configuration state if it doesn't exist.
     */
    const initialize = function () {
        if (!state[API_NAME]) {
            state[API_NAME] = { ...DEFAULT_STATE };
        } else {
            // Ensure existing state has new keys
            const config = state[API_NAME];
            for (const key in DEFAULT_STATE) {
                if (config[key] === undefined) {
                    config[key] = DEFAULT_STATE[key];
                }
            }
        }

        const config = state[API_NAME];
        log(`👁️‍🗨️ ${API_NAME} v${VERSION} Ready! (Updated: ${UPDATE_DATE})`);
    }

    /**
     * Registers event handlers for configuration input and graphic changes.
     */
    const registerHandlers = function () {
        on('chat:message', handleConfigInput);
        on('change:graphic', handleGraphicChange);
        on('remove:graphic', handleGraphicRemoval);
    }

    /**
     * Removes all managed shadows from the current game.
     */
    const removeAllManagedShadows = function () {
        const sourcesToShadowsMap = state[API_NAME].sourcesToShadowsMap;
        for (const sourceObjId in sourcesToShadowsMap) {
            const shadowObjectId = state[API_NAME].sourcesToShadowsMap[sourceObjId];
            const shadowObj = getObj('graphic', shadowObjectId);
            if (shadowObj) shadowObj.remove();
            delete sourcesToShadowsMap[sourceObjId];
        }
    }

    /**
     * Resets the configuration state.
     */
    const resetConfiguration = function () {
        state[API_NAME] = { ...DEFAULT_STATE };
    }

    /**
     * Creates or updates the existing shadow for a given source object.
     * @param {any} sourceObj
     * @param {number} altitude
     */
    const updateShadow = function (sourceObj, altitude) {
        const sourcesToShadowsMap = state[API_NAME].sourcesToShadowsMap;
        const sourceObjId = sourceObj.get('_id');
        const shadowId = sourcesToShadowsMap[sourceObjId];
        const shadowToken = shadowId ? getObj('graphic', shadowId) : null;

        const altitudeInteger = parseInt(altitude, 10);

        if (altitudeInteger == 0 || isNaN(altitudeInteger)) {
            if (shadowToken) shadowToken.remove();
            if (shadowId) delete sourcesToShadowsMap[sourceObjId];
            return;
        }

        const pageId = sourceObj.get('pageid');
        const offsetInPixels = altitudeInteger * getPixelsPerGridUnit(pageId);

        const newLeft = sourceObj.get('left');
        const newTop = sourceObj.get('top') + offsetInPixels;
        const newLayer = altitudeInteger > 0 ? 'map' : 'foreground';

        if (shadowToken) {
            shadowToken.set({
                left: newLeft,
                top: newTop,
                layer: newLayer
            });
            return;
        }

        createShadow(sourceObj, newLayer, offsetInPixels);
    }

    /**
     * Updates the tags on managed shadows.
     * @param {string} previousTag The previous tag to remove from the managed objects.
     * @param {string} newTag The new tag to apply to the managed objects.
     */
    const updateTags = function (previousTag, newTag) {
        const sourcesToShadowsMap = state[API_NAME].sourcesToShadowsMap;
        for (const sourceObjId in sourcesToShadowsMap) {
            const shadowObjectId = state[API_NAME].sourcesToShadowsMap[sourceObjId];
            const shadowObj = getObj('graphic', shadowObjectId);
            const tags = shadowObj.get('tags');
            if (!tags) continue;
            const indexOfPreviousTag = tags.indexOf(previousTag);
            if (indexOfPreviousTag > -1) tags.splice(indexOfPreviousTag, 1);
            tags.push(newTag);
        }
    }

    on('ready', () => {
        initialize();
        registerHandlers();
    });
})();