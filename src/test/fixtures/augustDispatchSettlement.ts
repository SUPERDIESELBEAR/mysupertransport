/**
 * Real STORED rows for the August 2026 dispatch settlement, exported from the
 * live tables with psql. Not hand-authored: the reader is tested against what
 * the writer actually persisted (standing rule — test a persisted shape at BOTH
 * boundaries, and derive the reader's fixture from the writer's output).
 */
export const AUGUST_STORED = {
  "settlement": {
    "id": "d6566cef-5c41-4dac-801f-8275fcf99460",
    "period_month": "2026-08-01",
    "payee_key": "dispatch_company",
    "status": "draft",
    "factoring_pct": 2.0,
    "dispatch_pct": 5.0,
    "eligible_base": 16080.47,
    "factoring_reduction": 321.61,
    "reduced_base": 15758.86,
    "dispatch_fee": 787.94,
    "deductions_amount": 0,
    "net_amount": 787.94,
    "computed_at": "2026-09-03T16:09:58.391864+00:00",
    "approved_at": null,
    "approved_by": null,
    "paid_at": null,
    "void_reason": null,
    "notes": null,
    "created_at": "2026-09-03T16:09:58.391864+00:00",
    "updated_at": "2026-09-03T16:09:58.391864+00:00",
    "created_by": "a9f93d0a-1532-4e2a-ad1c-2d99ab086902",
    "updated_by": "a9f93d0a-1532-4e2a-ad1c-2d99ab086902"
  },
  "lines": [
    {
      "id": "03a2eb20-1e8d-4d5c-979c-a538558e31be",
      "line_type": "dispatch_fee",
      "amount": 787.94,
      "description": "Dispatch fee \u2014 2026-08",
      "load_id": null,
      "dispatcher_id": null
    },
    {
      "id": "b31a8541-e97f-4053-b260-ee0022d5eadd",
      "line_type": "factoring_reduction",
      "amount": -321.61,
      "description": "Factoring reduction \u2014 2% of eligible base",
      "load_id": null,
      "dispatcher_id": null
    },
    {
      "id": "8879a9af-5018-4f65-9775-2e4fa1f4ce1b",
      "line_type": "load_base",
      "amount": 6750,
      "description": "Load ST26059 \u2014 eligible base",
      "load_id": "20cedd15-e1d6-481e-9062-5a344267244c",
      "dispatcher_id": "45c7510d-563b-409b-bd43-a24b67c6069a"
    },
    {
      "id": "5dcb2f2b-c4d2-4b3a-a6d5-2cff94c2ddd7",
      "line_type": "load_base",
      "amount": 150,
      "description": "Load ST26060 \u2014 eligible base",
      "load_id": "1ddd39df-26d6-477f-aa45-0a4108e9b739",
      "dispatcher_id": null
    },
    {
      "id": "7dbf6da0-37d7-41b3-b4aa-71ad549f81f4",
      "line_type": "load_base",
      "amount": 1875,
      "description": "Load ST-TEST-005 \u2014 eligible base",
      "load_id": "673e1887-9db7-48db-9722-6355abd30e33",
      "dispatcher_id": null
    },
    {
      "id": "5129ac09-5f82-4d3e-9bb3-706b02e4834f",
      "line_type": "load_base",
      "amount": 2300,
      "description": "Load ST26058 \u2014 eligible base",
      "load_id": "feab7795-7132-4984-9ff3-e1e7c677a0b7",
      "dispatcher_id": "45c7510d-563b-409b-bd43-a24b67c6069a"
    },
    {
      "id": "5b38bb7f-3914-47d3-b3e2-eff6d98cd663",
      "line_type": "load_base",
      "amount": 2800,
      "description": "Load ST26056 \u2014 eligible base",
      "load_id": "5f48da12-c55f-45c1-b559-a553deb219c9",
      "dispatcher_id": "cc126bd5-1db7-4656-b559-27b521a7c89f"
    },
    {
      "id": "88aeea6f-a098-4167-8f1e-c6ed83b22017",
      "line_type": "load_base",
      "amount": 1750,
      "description": "Load ST26063 \u2014 eligible base",
      "load_id": "fcccf204-fa5c-407a-960e-7a2cf720c882",
      "dispatcher_id": "cc126bd5-1db7-4656-b559-27b521a7c89f"
    },
    {
      "id": "f9d2a3a7-d4bc-4b38-98bc-ae9bb26fa516",
      "line_type": "load_base",
      "amount": 455.47,
      "description": "Load ST-TEST-003 \u2014 eligible base",
      "load_id": "c222d62f-3b9d-41a1-8979-be760e43e11b",
      "dispatcher_id": null
    }
  ],
  "contribs": [
    {
      "id": "1de32a3a-8759-4422-8e76-44f9b8c3d293",
      "load_id": "c222d62f-3b9d-41a1-8979-be760e43e11b",
      "load_number": "ST-TEST-003",
      "load_type": "per_ton",
      "rate_type": "per_ton",
      "delivered_at": "2026-08-18T21:10:00+00:00",
      "carrier_delivery_date": "2026-08-18",
      "header_component": 455.47,
      "fsc_component": 0,
      "charges_included_amount": 0,
      "charges_excluded_amount": 0,
      "base_total": 455.47,
      "dispatcher_id": null,
      "dispatch_settlement_charge_verdicts": []
    },
    {
      "id": "cdd22b46-e915-4820-a5f8-8c2eaf6262e4",
      "load_id": "673e1887-9db7-48db-9722-6355abd30e33",
      "load_number": "ST-TEST-005",
      "load_type": "standard",
      "rate_type": "flat",
      "delivered_at": "2026-08-16T19:35:00+00:00",
      "carrier_delivery_date": "2026-08-16",
      "header_component": 1875,
      "fsc_component": 0,
      "charges_included_amount": 0,
      "charges_excluded_amount": 0,
      "base_total": 1875,
      "dispatcher_id": null,
      "dispatch_settlement_charge_verdicts": []
    },
    {
      "id": "ee003009-1e4c-4cff-93be-b254adc3f27a",
      "load_id": "5f48da12-c55f-45c1-b559-a553deb219c9",
      "load_number": "ST26056",
      "load_type": "standard",
      "rate_type": "flat",
      "delivered_at": "2026-08-04T15:29:00+00:00",
      "carrier_delivery_date": "2026-08-04",
      "header_component": 2800,
      "fsc_component": 0,
      "charges_included_amount": 0,
      "charges_excluded_amount": 500,
      "base_total": 2800,
      "dispatcher_id": "cc126bd5-1db7-4656-b559-27b521a7c89f",
      "dispatch_settlement_charge_verdicts": [
        {
          "id": "ac137d9f-0b27-45b5-81ce-2adfbadf06a8",
          "charge_type": "detention",
          "classification": "detention",
          "amount": 500,
          "excluded": true,
          "exclusion_reason": "pct_100",
          "resolved_pct": 100,
          "pct_column": "detention_pct"
        }
      ]
    },
    {
      "id": "105aa64c-ff66-4cd9-92e4-9943e596b794",
      "load_id": "feab7795-7132-4984-9ff3-e1e7c677a0b7",
      "load_number": "ST26058",
      "load_type": "standard",
      "rate_type": "flat",
      "delivered_at": "2026-08-31T14:29:00+00:00",
      "carrier_delivery_date": "2026-08-31",
      "header_component": 2300,
      "fsc_component": 0,
      "charges_included_amount": 0,
      "charges_excluded_amount": 0,
      "base_total": 2300,
      "dispatcher_id": "45c7510d-563b-409b-bd43-a24b67c6069a",
      "dispatch_settlement_charge_verdicts": []
    },
    {
      "id": "8ec6e2be-3a09-4c9b-be76-5f3fc93fc054",
      "load_id": "20cedd15-e1d6-481e-9062-5a344267244c",
      "load_number": "ST26059",
      "load_type": "standard",
      "rate_type": "per_ton",
      "delivered_at": "2026-08-07T13:28:00+00:00",
      "carrier_delivery_date": "2026-08-07",
      "header_component": 6750,
      "fsc_component": 0,
      "charges_included_amount": 0,
      "charges_excluded_amount": 0,
      "base_total": 6750,
      "dispatcher_id": "45c7510d-563b-409b-bd43-a24b67c6069a",
      "dispatch_settlement_charge_verdicts": []
    },
    {
      "id": "ab9437e7-987f-4e98-b858-64938f52a0a7",
      "load_id": "1ddd39df-26d6-477f-aa45-0a4108e9b739",
      "load_number": "ST26060",
      "load_type": "loadout",
      "rate_type": "flat",
      "delivered_at": "2026-08-24T19:30:00+00:00",
      "carrier_delivery_date": "2026-08-24",
      "header_component": 150,
      "fsc_component": 0,
      "charges_included_amount": 0,
      "charges_excluded_amount": 0,
      "base_total": 150,
      "dispatcher_id": null,
      "dispatch_settlement_charge_verdicts": []
    },
    {
      "id": "1e675ba6-0dbd-43f2-a2b4-554d744a7cf6",
      "load_id": "fcccf204-fa5c-407a-960e-7a2cf720c882",
      "load_number": "ST26063",
      "load_type": "standard",
      "rate_type": "flat",
      "delivered_at": "2026-08-21T16:30:00+00:00",
      "carrier_delivery_date": "2026-08-21",
      "header_component": 1600,
      "fsc_component": 0,
      "charges_included_amount": 150,
      "charges_excluded_amount": 200,
      "base_total": 1750,
      "dispatcher_id": "cc126bd5-1db7-4656-b559-27b521a7c89f",
      "dispatch_settlement_charge_verdicts": [
        {
          "id": "ecf748fc-627a-4580-a889-1593e9740374",
          "charge_type": "lumper",
          "classification": "lumper",
          "amount": 200,
          "excluded": true,
          "exclusion_reason": "pct_100",
          "resolved_pct": 100,
          "pct_column": "lumper_reimbursement_pct"
        },
        {
          "id": "f0d00935-c037-4bf0-98ad-0a26680bd723",
          "charge_type": "tonu",
          "classification": "tonu",
          "amount": 150,
          "excluded": false,
          "exclusion_reason": null,
          "resolved_pct": 72,
          "pct_column": "tonu_pct"
        }
      ]
    }
  ],
  "rates": [
    {
      "dispatch_pct": 5.0,
      "factoring_pct": 2.0,
      "effective_from": "2026-01-01",
      "effective_to": null
    }
  ],
  "profiles": [
    {
      "id": "a9f93d0a-1532-4e2a-ad1c-2d99ab086902",
      "first_name": "Marcus",
      "last_name": "Mueller"
    },
    {
      "id": "45c7510d-563b-409b-bd43-a24b67c6069a",
      "first_name": "Jack",
      "last_name": "Barney"
    },
    {
      "id": "cc126bd5-1db7-4656-b559-27b521a7c89f",
      "first_name": "Daniel",
      "last_name": "Brown"
    }
  ]
} as const;
