export const CONFIG = {
  baseUrl: 'https://www.genesisofmanchester.com',
  listingPages: [
    {
      name: 'new',
      url: 'https://www.genesisofmanchester.com/new-inventory/index.htm',
      condition: 'new'
    },
    {
      name: 'shared-used',
      url: 'https://www.genesisofmanchester.com/used-inventory/shared-inventory.htm',
      condition: 'used'
    }
  ],
  requestDelayMs: 650,
  navigationTimeoutMs: 45000,
  maxListingScrolls: 60,
  stableScrollRounds: 4,
  validation: {
    minimumTotalVehicles: 20,
    minimumNewVehicles: 10,
    minimumVinCompleteness: 0.7,
    minimumRetainedRatio: 0.45
  }
};
