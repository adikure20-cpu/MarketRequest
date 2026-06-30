/**
 * Predefined popular market requests and data utilities
 * Sports and markets based on Tipico.de current offering
 */

const PRESET_MARKETS = [
    // Fußball
    { id: 'mkt-004', name: 'Erster Torschütze', category: 'Fußball', description: 'Spieler erzielt das erste Tor', popular: true },

    // Tennis
    { id: 'mkt-010', name: 'Matchsieger', category: 'Tennis', description: 'Gewinner des Matches', popular: true },
    { id: 'mkt-011', name: 'Satzwette', category: 'Tennis', description: 'Genaue Anzahl der Sätze', popular: true },
    { id: 'mkt-012', name: 'Über/Unter Games', category: 'Tennis', description: 'Gesamtzahl der Games', popular: true },

    // Basketball
    { id: 'mkt-020', name: 'Siegwette', category: 'Basketball', description: 'Gewinner des Spiels', popular: true },
    { id: 'mkt-021', name: 'Über/Unter Punkte', category: 'Basketball', description: 'Gesamtpunkte über/unter', popular: true },
    { id: 'mkt-022', name: 'Handicap', category: 'Basketball', description: 'Punktevorsprung-Wette', popular: true },

    // Eishockey
    { id: 'mkt-030', name: 'Siegwette', category: 'Eishockey', description: '1X2 Ergebnis', popular: true },
    { id: 'mkt-031', name: 'Über/Unter Tore', category: 'Eishockey', description: 'Gesamttore über/unter', popular: true },

    // Tennis de Table / Tischtennis
    { id: 'mkt-040', name: 'Matchsieger', category: 'Tischtennis', description: 'Gewinner des Matches', popular: true },
    { id: 'mkt-041', name: 'Satzwette', category: 'Tischtennis', description: 'Genaue Anzahl der Sätze', popular: true },

    // American Football
    { id: 'mkt-050', name: 'Siegwette', category: 'American Football', description: 'Moneyline Gewinner', popular: true },
    { id: 'mkt-051', name: 'Über/Unter Punkte', category: 'American Football', description: 'Gesamtpunkte', popular: true },
    { id: 'mkt-052', name: 'Handicap', category: 'American Football', description: 'Spread-Wette', popular: true },

    // Handball
    { id: 'mkt-060', name: 'Siegwette', category: 'Handball', description: '1X2 Ergebnis', popular: true },
    { id: 'mkt-061', name: 'Über/Unter Tore', category: 'Handball', description: 'Gesamttore', popular: true },

    // Volleyball
    { id: 'mkt-070', name: 'Matchsieger', category: 'Volleyball', description: 'Gewinner des Matches', popular: true },
    { id: 'mkt-071', name: 'Satzwette', category: 'Volleyball', description: 'Genaue Satzanzahl', popular: true },

    // Darts
    { id: 'mkt-080', name: 'Matchsieger', category: 'Darts', description: 'Gewinner des Matches', popular: true },
    { id: 'mkt-081', name: 'Über/Unter Legs', category: 'Darts', description: 'Gesamtzahl der Legs', popular: true },

    // MMA/Boxen
    { id: 'mkt-090', name: 'Kampfsieger', category: 'MMA/Boxen', description: 'Gewinner des Kampfes', popular: true },
    { id: 'mkt-091', name: 'Art des Sieges', category: 'MMA/Boxen', description: 'KO, TKO, Entscheidung', popular: true },

    // Golf
    { id: 'mkt-100', name: 'Turniersieger', category: 'Golf', description: 'Gewinner des Turniers', popular: true },

    // Rugby
    { id: 'mkt-110', name: 'Siegwette', category: 'Rugby', description: 'Gewinner des Spiels', popular: true },
    { id: 'mkt-111', name: 'Handicap', category: 'Rugby', description: 'Punktevorsprung', popular: true },

    // Cricket
    { id: 'mkt-120', name: 'Matchsieger', category: 'Cricket', description: 'Gewinner des Matches', popular: true },

    // Motorsport
    { id: 'mkt-130', name: 'Rennsieger', category: 'Motorsport', description: 'Gewinner des Rennens', popular: true },
    { id: 'mkt-131', name: 'Podiumsplatz', category: 'Motorsport', description: 'Top-3-Platzierung', popular: true },
];

const SPORT_ICONS = {
    'Fußball': '⚽',
    'Tennis': '🎾',
    'Basketball': '🏀',
    'Eishockey': '🏒',
    'Tischtennis': '🏓',
    'American Football': '🏈',
    'Handball': '🤾',
    'Volleyball': '🏐',
    'Darts': '🎯',
    'MMA/Boxen': '🥊',
    'Golf': '⛳',
    'Rugby': '🏉',
    'Cricket': '🏏',
    'Motorsport': '🏎️',
    'Sonstiges': '📋'
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
