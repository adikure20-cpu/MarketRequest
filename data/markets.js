/**
 * Predefined popular market requests and data utilities
 * Sports and markets based on Tipico.de current offering
 */

const PRESET_MARKETS = [
    // Fußball
    { id: 'mkt-004', name: 'Erster Torschütze', category: 'Fußball', description: 'Spieler erzielt das erste Tor', popular: true },

    // Nach Wunsch
    { id: 'mkt-200', name: 'Eigene Wette', category: 'Nach Wunsch', description: 'Eigene Wette frei eingeben', popular: true },
];

const SPORT_ICONS = {
    'Fußball': '⚽',
    'Nach Wunsch': '✍️'
};

const STATUS_LABELS = {
    submitted: 'Ihre Anfrage wurde empfangen.',
    under_review: 'Bleiben Sie dran — die Buchmacher prüfen Ihre Anfrage.',
    approved: 'Ihr angefragter Markt wurde genehmigt.',
    available: 'Der Markt ist jetzt in diesem Shop zum Wetten verfügbar.',
    declined: 'Dieser Markt kann derzeit nicht angeboten werden.',
    expired: 'Das Event hat begonnen oder das Anfragefenster ist geschlossen.'
};

const STATUS_COLORS = {
    submitted: '#42a5f5',
    under_review: '#ffd700',
    approved: '#4caf50',
    available: '#66bb6a',
    declined: '#dc0000',
    expired: '#999999'
};

const DECLINE_REASONS = [
    { code: 'risk', label: 'Risikomanagement-Richtlinie' },
    { code: 'trading_policy', label: 'Handelsrichtlinien-Beschränkung' },
    { code: 'missing_data', label: 'Unzureichende Daten verfügbar' },
    { code: 'event_started', label: 'Event hat bereits begonnen' },
    { code: 'market_not_supported', label: 'Markttyp nicht unterstützt' },
    { code: 'compliance', label: 'Compliance-Beschränkung' },
    { code: 'duplicate', label: 'Duplikat einer bestehenden Anfrage' },
    { code: 'other', label: 'Sonstiger Grund' }
];

const PRIORITY_RULES = {
    urgentThresholdMinutes: 30,
    highDemandThreshold: 3
};
