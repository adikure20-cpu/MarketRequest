/**
 * AKID Meta - Shop/Account registry
 * Each shop has a unique akid. The QR code and customer link contain the akid.
 * All shop information is resolved from this lookup.
 */

const AKID_META = {
    'AK-001-LON-CE': {
        akid: 'AK-001-LON-CE',
        accountName: 'London Central',
        address: 'Oxford Street 142, London EC1A 1BB',
        region: 'London',
        vip: false,
        active: true
    },
    'AK-002-LON-EA': {
        akid: 'AK-002-LON-EA',
        accountName: 'London East',
        address: 'Mile End Road 88, London E1 4UN',
        region: 'London',
        vip: false,
        active: true
    },
    'AK-003-MAN-HB': {
        akid: 'AK-003-MAN-HB',
        accountName: 'Manchester Hub',
        address: 'Deansgate 56, Manchester M3 2EG',
        region: 'Manchester',
        vip: false,
        active: true
    },
    'AK-004-LON-VP': {
        akid: 'AK-004-LON-VP',
        accountName: 'London VIP Lounge',
        address: 'Mayfair Place 12, London W1J 8AJ',
        region: 'London',
        vip: true,
        active: true
    },
    'AK-005-BER-MI': {
        akid: 'AK-005-BER-MI',
        accountName: 'Berlin Mitte',
        address: 'Friedrichstraße 112, 10117 Berlin',
        region: 'Berlin',
        vip: false,
        active: true
    },
    'AK-006-MUC-HB': {
        akid: 'AK-006-MUC-HB',
        accountName: 'München Hauptbahnhof',
        address: 'Bayerstraße 25, 80335 München',
        region: 'München',
        vip: false,
        active: true
    },
    'AK-007-HAM-CT': {
        akid: 'AK-007-HAM-CT',
        accountName: 'Hamburg City',
        address: 'Mönckebergstraße 7, 20095 Hamburg',
        region: 'Hamburg',
        vip: false,
        active: true
    },
    'AK-008-KOL-EH': {
        akid: 'AK-008-KOL-EH',
        accountName: 'Köln Ehrenfeld',
        address: 'Venloer Str. 201, 50823 Köln',
        region: 'Köln',
        vip: false,
        active: true
    },
    '151111': {
        akid: '151111',
        accountName: 'Test Shop',
        address: 'Teststraße 1, 10000 Teststadt',
        region: 'Test',
        vip: false,
        active: true
    },
    'AK-DEMO-001': {
        akid: 'AK-DEMO-001',
        accountName: 'Demo Shop',
        address: 'Teststraße 1, 10000 Demo City',
        region: 'Demo',
        vip: false,
        active: true
    },
    'AK-INACTIVE': {
        akid: 'AK-INACTIVE',
        accountName: 'Closed Shop',
        address: 'Nowhere Street 0',
        region: 'None',
        vip: false,
        active: false
    }
};

/**
 * Look up shop info by akid
 * Returns null if not found or inactive
 */
function getShopByAkid(akid) {
    if (!akid) return null;
    const shop = AKID_META[akid];
    if (!shop) return null;
    if (!shop.active) return null;
    return shop;
}

/**
 * Get all active shops (for dashboard dropdown etc.)
 */
function getAllActiveShops() {
    return Object.values(AKID_META).filter(s => s.active);
}
