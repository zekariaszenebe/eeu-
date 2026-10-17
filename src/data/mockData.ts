import { FeederInterruption, ContactItem } from '../types';
import { INITIAL_FEEDERS_LIST } from './feedersList';

export { INITIAL_FEEDERS_LIST };

export const INITIAL_DISTRICTS = [
  'Team A',
  'Team B',
  'Team C',
  'Team D'
];

export const INITIAL_INTERRUPTIONS: FeederInterruption[] = [];


export const INITIAL_CUSTOMER_CONTACTS: ContactItem[] = [
  // Head & Regional
  { id: 'cc-2', name: 'North Region Office', phone: '011-126-7244', category: 'head_regional', locationInfo: 'Infront of Abune Petros Monument' },
  { id: 'cc-1', name: 'Head Office', phone: '011-636-6028', category: 'head_regional', locationInfo: 'Main Headquarters' },
  { id: 'cc-3', name: 'South Region Office', phone: '011-557-3175', category: 'head_regional', locationInfo: 'Infront of Global Hotel' },
  { id: 'cc-4', name: 'East Region Office', phone: '011-667-5875', category: 'head_regional', locationInfo: 'Kotebe Bireta Biret' },
  { id: 'cc-5', name: 'West Region Office', phone: '011-552-0231', category: 'head_regional', locationInfo: 'Fit Ber to Kazanchis turn' },

  // Sheger Region
  { id: 'cc-6', name: 'Burayu', phone: '011-284-0614', category: 'sheger_city', locationInfo: 'Sheger Region Burayu area branch' },
  { id: 'cc-7', name: 'Alemgena', phone: '011-338-1314', category: 'sheger_city', locationInfo: 'Sheger Region Alemgena branch' },
  { id: 'cc-8', name: 'Welete', phone: '011-380-5250', category: 'sheger_city', locationInfo: 'Sheger Region Welete branch' },
  { id: 'cc-9', name: 'Bishoftu 1', phone: '011-433-3181', category: 'sheger_city', locationInfo: 'Sheger Region Bishoftu main line (Alternative lines: 011-433-8773 / 011-433-8075)' },
  { id: 'cc-10', name: 'Bishoftu 2', phone: '011-432-0335', category: 'sheger_city', locationInfo: 'Sheger Region Bishoftu secondary branch' },
  { id: 'cc-11', name: 'Legatafo', phone: '011-218-0099', category: 'sheger_city', locationInfo: 'Sheger Region Legatafo branch' },
  { id: 'cc-12', name: 'Sululta', phone: '011-161-7960', category: 'sheger_city', locationInfo: 'Sheger Region Sululta branch' },
  { id: 'cc-13', name: 'Holeta', phone: '011-261-0345', category: 'sheger_city', locationInfo: 'Sheger Region Holeta branch' },
  { id: 'cc-14', name: 'Sandafa', phone: '011-686-0564', category: 'sheger_city', locationInfo: 'Sheger Region Sandafa branch' },

  // Regional hotlines
  { id: 'cc-15', name: 'Harari Region Support', phone: '025-666-0044', category: 'regional_hotline', locationInfo: 'Harari Regional office', hotlineShortCode: '9466' },
  { id: 'cc-16', name: 'Dire Dawa Administration', phone: '8145', category: 'regional_hotline', locationInfo: 'Dire Dawa Administration direct support line', hotlineShortCode: '8145' },
  { id: 'cc-17', name: 'Benishangul-Gumuz Region', phone: '9418', category: 'regional_hotline', locationInfo: 'Benishangul-Gumuz direct support line', hotlineShortCode: '9418' },
  { id: 'cc-18', name: 'Somali Region Support', phone: '9337', category: 'regional_hotline', locationInfo: 'Somali Region direct support line', hotlineShortCode: '9337' },
  { id: 'cc-19', name: 'Hawassa Region Office', phone: '046-220-0419', category: 'regional_hotline', locationInfo: 'Hawassa Region service hub' },
  { id: 'cc-20', name: 'Gambela Region Office', phone: '047-551-0098', category: 'regional_hotline', locationInfo: 'Gambela Region service hub' },
  { id: 'cc-21', name: 'Afar Region Office', phone: '033-666-0671', category: 'regional_hotline', locationInfo: 'Afar Region service hub' },
  { id: 'cc-22', name: 'Amhara Region Office', phone: '058-220-0077', category: 'regional_hotline', locationInfo: 'Amhara Region service hub' },
  { id: 'cc-23', name: 'Oromia Region Office', phone: '011-522-61-91', category: 'regional_hotline', locationInfo: 'Oromia Region service hub' }
];
