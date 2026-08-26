import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';

/**
 * What the live parse edge function returned for the Nationwide tender U6683409
 * on 2026-08-26, recorded verbatim from the response — not hand-written.
 *
 * The document's Special Instructions block is printed cleanly, so adoption is
 * expected to store the PAGE's text over this transcription. That is the whole
 * point of the fixture: if the ingest path reports no_layer where the manual
 * path adopts, the extractor is not equivalent.
 */
const RAW = {
  "parser_build": {
    "contract": 5,
    "built_at": "2026-08-24T14:50:00Z",
    "notes": "contract 4 + run envelope (model/seed/seed_echoed/system_fingerprint) required",
    "code_hash": "4f39d6ae"
  },
  "broker": {
    "company_name": {
      "value": "Nationwide Logistics",
      "confidence": "high"
    },
    "mc_number": {
      "value": "194259",
      "confidence": "high"
    },
    "contact_name": {
      "value": "Mac Jarosz",
      "confidence": "high"
    },
    "contact_phone": {
      "value": "(215) 999-6797",
      "confidence": "high"
    },
    "contact_email": {
      "value": "mac.j@nationwidelogistics.net",
      "confidence": "high"
    },
    "address_line1": {
      "value": "2245 Gilbert Ave, Ste 103",
      "confidence": "medium"
    },
    "address_line2": {
      "value": "Ste 103",
      "confidence": "medium"
    },
    "city": {
      "value": "Cincinnati",
      "confidence": "medium"
    },
    "state": {
      "value": "OH",
      "confidence": "medium"
    },
    "zip": {
      "value": "45206",
      "confidence": "medium"
    },
    "address_source": "letterhead"
  },
  "load": {
    "broker_load_number": {
      "value": "U6683409",
      "confidence": "high"
    },
    "bol_number": {
      "value": null,
      "confidence": "low"
    },
    "po_number": {
      "value": null,
      "confidence": "low"
    },
    "equipment_type": {
      "value": "dry_van",
      "confidence": "high"
    },
    "handling_type": {
      "value": null,
      "confidence": "low"
    },
    "commodity": {
      "value": "CLEAN BALES",
      "confidence": "high"
    },
    "weight_lbs": {
      "value": 41000,
      "confidence": "high"
    },
    "loaded_miles": {
      "value": 373,
      "confidence": "high"
    },
    "is_hazmat": {
      "value": false,
      "confidence": "medium"
    },
    "is_team_load": {
      "value": false,
      "confidence": "medium"
    }
  },
  "reefer": {
    "temp_f": {
      "value": null,
      "confidence": "low"
    },
    "temp_min_f": {
      "value": null,
      "confidence": "low"
    },
    "temp_max_f": {
      "value": null,
      "confidence": "low"
    },
    "precool_required": {
      "value": null,
      "confidence": "low"
    },
    "continuous_run": {
      "value": null,
      "confidence": "low"
    },
    "notes": {
      "value": null,
      "confidence": "low"
    }
  },
  "rate": {
    "linehaul": {
      "value": 1600,
      "confidence": "high"
    },
    "fsc_amount": {
      "value": null,
      "confidence": "low"
    },
    "total": {
      "value": 1600,
      "confidence": "high"
    },
    "line_items": [
      {
        "description": "Trip Settlmt (Revenue) Carrier",
        "amount": 1600,
        "category": "linehaul",
        "stop_hint": null,
        "confidence": "high"
      }
    ]
  },
  "stops": [
    {
      "sequence": 1,
      "stop_type": "pickup",
      "facility_name": {
        "value": "GADSDEN WAREHOUSE.",
        "confidence": "high"
      },
      "address_line1": {
        "value": "600 RODNEY AUSTIN BLVD SE",
        "confidence": "high"
      },
      "address_line2": {
        "value": null,
        "confidence": "low"
      },
      "city": {
        "value": "ATTALLA",
        "confidence": "high"
      },
      "state": {
        "value": "AL",
        "confidence": "high"
      },
      "zip": {
        "value": "35954",
        "confidence": "high"
      },
      "contact_name": {
        "value": null,
        "confidence": "low"
      },
      "contact_phone": {
        "value": null,
        "confidence": "low"
      },
      "appointment_start": {
        "value": "2026-08-20T10:30",
        "confidence": "high"
      },
      "appointment_end": {
        "value": "2026-08-20T10:30",
        "confidence": "high"
      },
      "notes": {
        "value": null,
        "confidence": "low"
      },
      "notes_verbatim": {
        "value": null,
        "confidence": "low"
      },
      "references": [
        {
          "label": "Pickup #",
          "value": "274461",
          "confidence": "high"
        }
      ]
    },
    {
      "sequence": 2,
      "stop_type": "delivery",
      "facility_name": {
        "value": "ATLANTIC MARINE WAREHOUSE COMPANY",
        "confidence": "high"
      },
      "address_line1": {
        "value": "2495 TREMONT RD",
        "confidence": "high"
      },
      "address_line2": {
        "value": null,
        "confidence": "low"
      },
      "city": {
        "value": "SAVANNAH",
        "confidence": "high"
      },
      "state": {
        "value": "GA",
        "confidence": "high"
      },
      "zip": {
        "value": "31405",
        "confidence": "high"
      },
      "contact_name": {
        "value": null,
        "confidence": "low"
      },
      "contact_phone": {
        "value": null,
        "confidence": "low"
      },
      "appointment_start": {
        "value": "2026-08-21T09:00",
        "confidence": "high"
      },
      "appointment_end": {
        "value": "2026-08-21T11:00",
        "confidence": "high"
      },
      "notes": {
        "value": null,
        "confidence": "low"
      },
      "notes_verbatim": {
        "value": null,
        "confidence": "low"
      },
      "references": [
        {
          "label": "Delivery #",
          "value": "64249666",
          "confidence": "high"
        }
      ]
    }
  ],
  "special_instructions": {
    "value": "All communications through 484-435-3131. Driver must accept Macropoint tracking. Failure to track results in $150.00 reduction. Notify of OS&D immediately. Paperwork due within 48 hours or $150.00 reduction. Invoice within 24 hours of delivery.",
    "confidence": "high"
  },
  "verbatim": {
    "broker_terms": {
      "value": null,
      "confidence": "low"
    },
    "special_instructions": {
      "value": "Any communications regarding this load, including but not limited to pick up/delivery schedule, directions, OTR\nissues, etc. must go through 484-435-3131. Carrier is not to contact shipper or receiver directly.\n\nDriver must accept and maintain Macropoint tracking for the duration of the shipment.\nFailure to accept and maintain tracking for the duration of shipment will result in denial of any accessorial pay.\nFailure to accept tracking requests may result in removal from load, no TONU will be paid to carriers removed load\nfor failing to accept tracking.\nNo TONU will be paid for rejected trailers.\nCarrier must notify us immediately of any overages, shortages, or damages prior to departing shipper and/or\nreceiver.\nLate pick up or delivery may result in non-payment of freight charges, and special damages as a consequence of\nbeing late may apply.\nIn the event of a breakdown or any delay that jeopardizes on time delivery, we may request that the carrier allow a\nrepower of their trailer to avoid/mitigate damages.\n\nCarrier must invoice within 24 hours of delivery.",
      "confidence": "high"
    }
  },
  "references": [],
  "loadout_signals": {
    "no_bol_mentioned": false,
    "photo_pod_required": false,
    "multi_day_use_period": false,
    "trailer_relocation_language": false,
    "no_commodity": false,
    "trailer_number": {
      "value": null,
      "confidence": "low"
    },
    "trailer_owner_company": {
      "value": null,
      "confidence": "low"
    },
    "relocation_fee": {
      "value": null,
      "confidence": "low"
    },
    "use_period_days": {
      "value": null,
      "confidence": "low"
    },
    "use_start_date": {
      "value": null,
      "confidence": "low"
    },
    "use_end_date": {
      "value": null,
      "confidence": "low"
    }
  },
  "run": {
    "model": "google/gemini-3-flash-preview",
    "temperature": 0,
    "seed": 20260823,
    "seed_echoed": false,
    "system_fingerprint": null
  }
} as const;

export function nationwideParse(): ParsedRateConfirmation {
  return structuredClone(RAW) as unknown as ParsedRateConfirmation;
}
