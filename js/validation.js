/**
 * Input validation & content moderation
 * Shared between client and server (loaded in browser + required in Node)
 */
(function(global){
    var MAX_LENGTH = 30;

    // Profanity/insult word list across DE, EN, HR, TR (lowercase, no diacritics where possible)
    var BAD_WORDS = [
        // English
        'fuck','shit','bitch','asshole','bastard','cunt','dick','pussy','slut','whore','nigger','faggot','retard','motherfucker','cock','wanker',
        // German
        'scheisse','scheiss','arschloch','fotze','hurensohn','wichser','schlampe','hure','fick','ficken','miststueck','vollidiot','trottel','nutte','spast','missgeburt',
        // Croatian
        'jebi','jebem','picka','pizda','kurac','kurca','govno','seronja','kurwa','sranje','peder','drkadzija','majmune','debil','idiot',
        // Turkish
        'sik','sikeyim','orospu','piç','pic','amk','amina','yavsak','gavat','gerizekali','salak','oc','sikerim','ananı','anani'
    ];

    function normalize(str) {
        return (str || '').toLowerCase()
            .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss')
            .replace(/č/g,'c').replace(/ć/g,'c').replace(/ž/g,'z').replace(/š/g,'s').replace(/đ/g,'d')
            .replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ç/g,'c');
    }

    // Returns { valid: bool, reason: 'length'|'profanity'|'empty'|null, clean: string }
    function validateInput(str) {
        var clean = (str || '').trim();
        if (clean.length === 0) {
            return { valid: false, reason: 'empty', clean: '' };
        }
        if (clean.length > MAX_LENGTH) {
            return { valid: false, reason: 'length', clean: clean };
        }
        var norm = normalize(clean);
        // Check for bad words (whole word or substring match)
        var normNoSpace = norm.replace(/[^a-z0-9]/g,'');
        for (var i = 0; i < BAD_WORDS.length; i++) {
            var bw = BAD_WORDS[i];
            if (norm.indexOf(bw) > -1 || normNoSpace.indexOf(bw) > -1) {
                return { valid: false, reason: 'profanity', clean: clean };
            }
        }
        return { valid: true, reason: null, clean: clean };
    }

    // Sanitize - strip HTML/script chars to prevent injection
    function sanitize(str) {
        return (str || '').replace(/[<>]/g, '').trim().substring(0, MAX_LENGTH);
    }

    var api = { validateInput: validateInput, sanitize: sanitize, MAX_LENGTH: MAX_LENGTH };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.Validation = api;
})(typeof window !== 'undefined' ? window : this);
