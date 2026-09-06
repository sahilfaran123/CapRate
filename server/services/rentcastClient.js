import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * RentCast API Client
 * Docs: https://developers.rentcast.io
 * - Address-based search (no ZPID needed)
 * - Property value estimates (AVM)
 * - Rent estimates
 * - Full property details
 */
class RentCastClient {
  constructor() {
    this.apiKey = process.env.RENTCAST_API_KEY;
    this.baseURL = 'https://api.rentcast.io/v1';

    if (!this.apiKey) {
      console.warn('⚠️  RENTCAST_API_KEY not configured.');
    }
  }

  /**
   * Get full property data by address
   * Calls both /properties and /avm endpoints in parallel
   */
  async getPropertyDataByAddress(address, city, state, zip = null) {
    if (!this.apiKey) {
      throw new Error('RENTCAST_API_KEY not configured. Please add it to your .env file.');
    }

    const fullAddress = zip
      ? `${address}, ${city}, ${state} ${zip}`
      : `${address}, ${city}, ${state}`;


    const headers = {
      'Accept': 'application/json',
      'X-Api-Key': this.apiKey,
    };

    // Fetch property details, value estimate, and rent estimate in parallel
    const [propertyResult, valueResult, rentResult] = await Promise.allSettled([
      axios.get(`${this.baseURL}/properties`, {
        params: { address: fullAddress },
        headers,
        timeout: 15000,
      }),
      axios.get(`${this.baseURL}/avm/value`, {
        params: { address: fullAddress },
        headers,
        timeout: 15000,
      }),
      axios.get(`${this.baseURL}/avm/rent/long-term`, {
        params: { address: fullAddress },
        headers,
        timeout: 15000,
      }),
    ]);

    // Check if value estimate worked (this is the most important one)
    if (valueResult.status === 'rejected') {
      const err = valueResult.reason;
      console.error('[RentCast] Value estimate failed:', err.response?.data || err.message);

      if (err.response?.status === 401) {
        throw new Error('Invalid RentCast API key. Please check your RENTCAST_API_KEY in .env');
      } else if (err.response?.status === 404) {
        throw new Error(`Property not found: "${fullAddress}". Please check the address and try again.`);
      } else if (err.response?.status === 429) {
        throw new Error('RentCast API rate limit reached. You may need to upgrade your plan.');
      } else {
        throw new Error(`Failed to get property data: ${err.response?.data?.message || err.message}`);
      }
    }

    const valueData = valueResult.value.data;
    const propertyData = propertyResult.status === 'fulfilled' ? propertyResult.value.data : null;
    const rentData = rentResult.status === 'fulfilled' ? rentResult.value.data : null;


    return this.formatPropertyData(fullAddress, valueData, propertyData, rentData);
  }

  /**
   * Format all data into a consistent structure
   */
  formatPropertyData(address, valueData, propertyData, rentData) {
    // valueData.subjectProperty and propertyData both contain property details
    // propertyData has more fields (taxAssessments, features, hoa, etc.)
    // so we merge both, preferring propertyData for the richer fields
    const subjectProperty = valueData?.subjectProperty || {};
    const propDetails = propertyData || subjectProperty;

    const estimatedValue = valueData?.price || 0;
    const estimatedRent = rentData?.rent || null;

    // --- Appreciation: last sale price vs current estimated value ---
    // lastSalePrice and lastSaleDate come from both /properties and /avm subjectProperty
    const lastSalePrice = propDetails.lastSalePrice || subjectProperty.lastSalePrice || null;
    const lastSaleDate = propDetails.lastSaleDate || subjectProperty.lastSaleDate || null;

    let appreciation = null;
    let appreciationPercent = null;
    let appreciationLabel = null;

    if (lastSalePrice && estimatedValue && lastSalePrice > 0) {
      appreciation = estimatedValue - lastSalePrice;
      appreciationPercent = ((appreciation / lastSalePrice) * 100).toFixed(2);

      // Build a human-readable label like "Since last sale (Nov 2021)"
      if (lastSaleDate) {
        const saleYear = new Date(lastSaleDate).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        });
        appreciationLabel = `Since last sale (${saleYear})`;
      } else {
        appreciationLabel = 'Since last sale';
      }
    }

    // --- Cap rate ---
    let capRate = null;
    if (estimatedRent && estimatedValue > 0) {
      capRate = ((estimatedRent * 12) / estimatedValue * 100).toFixed(2);
    }

    // --- Price per sq ft ---
    let pricePerSqFt = null;
    if (estimatedValue && propDetails.squareFootage) {
      pricePerSqFt = (estimatedValue / propDetails.squareFootage).toFixed(2);
    }

    // --- Latest tax assessment ---
    const propertyTax = this.getLatestTaxAmount(propDetails.taxAssessments);

    const investorMetrics = {
      // Current value + range
      currentValue: estimatedValue,
      priceRangeLow: valueData?.priceRangeLow || null,
      priceRangeHigh: valueData?.priceRangeHigh || null,

      // Appreciation since last sale
      ...(appreciation !== null && {
        appreciation,
        appreciationPercent,
        appreciationLabel,
        lastSalePrice,
        lastSaleDate,
      }),

      // Rent metrics
      ...(estimatedRent && {
        estimatedMonthlyRent: estimatedRent,
        rentalValue: estimatedRent,
        rentRangeLow: rentData?.rentRangeLow || null,
        rentRangeHigh: rentData?.rentRangeHigh || null,
      }),

      // Investment metrics
      ...(capRate && { capRate }),
      ...(pricePerSqFt && { pricePerSquareFoot: pricePerSqFt }),

      // Property details
      ...(propDetails.bedrooms && { bedrooms: propDetails.bedrooms }),
      ...(propDetails.bathrooms && { bathrooms: propDetails.bathrooms }),
      ...(propDetails.squareFootage && { squareFootage: propDetails.squareFootage }),
      ...(propDetails.lotSize && { lotSize: propDetails.lotSize }),
      ...(propDetails.yearBuilt && { yearBuilt: propDetails.yearBuilt }),
      ...(propDetails.propertyType && { propertyType: propDetails.propertyType }),
      ...(propDetails.county && { county: propDetails.county }),
      ...(propDetails.subdivision && { subdivision: propDetails.subdivision }),

      // HOA fee
      ...(propDetails.hoa?.fee && { hoaFee: propDetails.hoa.fee }),

      // Tax info
      ...(propertyTax && { propertyTax }),

      lastUpdated: new Date().toISOString(),
    };

    // Remove null/undefined values
    Object.keys(investorMetrics).forEach(key => {
      if (investorMetrics[key] === null || investorMetrics[key] === undefined) {
        delete investorMetrics[key];
      }
    });

    return {
      address: propDetails.formattedAddress || 
        (propDetails.addressLine1
          ? `${propDetails.addressLine1}, ${propDetails.city}, ${propDetails.state} ${propDetails.zipCode}`
          : address),
      estimatedValue,
      investorMetrics,
    };
  }

  /**
   * Get most recent tax assessment amount from taxAssessments object
   * taxAssessments is keyed by year: { "2023": { value: 250000 }, "2022": { value: 240000 } }
   */
  getLatestTaxAmount(taxAssessments) {
    if (!taxAssessments || typeof taxAssessments !== 'object') return null;
    const years = Object.keys(taxAssessments).sort().reverse();
    if (years.length === 0) return null;
    return taxAssessments[years[0]]?.value || null;
  }
}

export default new RentCastClient();
