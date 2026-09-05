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
      url: 'https://www.autofairhyundai.com/used-inventory/index.htm',
      condition: 'used'
    },
    {
      name: 'certified',
      url: 'https://www.genesisofmanchester.com/certified-inventory/index.htm',
      condition: 'certified'
    }
  ],
  requestDelayMs: 250,
  navigationTimeoutMs: 45000,
  detailConcurrency: 6,
  validation: {
    minimumTotalVehicles: 100,
    minimumNewVehicles: 50,
    minimumPreOwnedVehicles: 100,
    minimumVinCompleteness: 0.85,
    minimumRetainedRatio: 0.45
  }
};
