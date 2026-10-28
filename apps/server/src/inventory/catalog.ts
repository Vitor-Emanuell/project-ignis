import type { Field } from '../idempotency/normalize.js';
export type Attribute = { type: 'integer' | 'number' | 'string'; unit: string | null; minimum?: number; exclusiveMinimum?: number; maximum?: number; enum?: string[]; required: boolean; nullable: boolean; demonstrationOnly: boolean };
export type CategoryProfile = { code: string; version: number; name: string; mobility: 'fixed' | 'mobile'; attributes: Record<string, Attribute> };
// Immutable operation schemas. Never read a mutable catalog to normalize a command.
export const CATEGORIES: readonly CategoryProfile[] = [
  {
    "code": "fixed_speed_radar",
    "version": 1,
    "name": "Radar de velocidade fixo",
    "mobility": "fixed",
    "attributes": {
      "regulatedSpeedLimitKmh": {
        "type": "integer",
        "unit": "km/h",
        "minimum": 1,
        "maximum": 200,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "red_light_radar",
    "version": 1,
    "name": "Radar de semáforo",
    "mobility": "fixed",
    "attributes": {
      "monitoredLaneCount": {
        "type": "integer",
        "unit": "faixas",
        "minimum": 1,
        "maximum": 32,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "turn_radar",
    "version": 1,
    "name": "Radar de conversão",
    "mobility": "fixed",
    "attributes": {
      "restrictedMovement": {
        "type": "string",
        "unit": null,
        "enum": [
          "left",
          "right",
          "u_turn"
        ],
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "camera",
    "version": 1,
    "name": "Câmera",
    "mobility": "fixed",
    "attributes": {
      "cameraType": {
        "type": "string",
        "unit": null,
        "enum": [
          "fixed_view",
          "ptz"
        ],
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "weighing_scale",
    "version": 1,
    "name": "Balança",
    "mobility": "fixed",
    "attributes": {
      "capacityKg": {
        "type": "number",
        "unit": "kg",
        "exclusiveMinimum": 0,
        "maximum": 100000,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "inspection_vehicle",
    "version": 1,
    "name": "Veículo de fiscalização",
    "mobility": "mobile",
    "attributes": {
      "occupantCapacity": {
        "type": "integer",
        "unit": "pessoas incluindo condutor",
        "minimum": 1,
        "maximum": 100,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "barrier_gate",
    "version": 1,
    "name": "Cancela",
    "mobility": "fixed",
    "attributes": {
      "openingWidthM": {
        "type": "number",
        "unit": "m",
        "exclusiveMinimum": 0,
        "maximum": 20,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "taxi",
    "version": 1,
    "name": "Táxi",
    "mobility": "mobile",
    "attributes": {
      "occupantCapacity": {
        "type": "integer",
        "unit": "pessoas incluindo condutor",
        "minimum": 1,
        "maximum": 20,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "motorcycle_taxi",
    "version": 1,
    "name": "Mototáxi",
    "mobility": "mobile",
    "attributes": {
      "occupantCapacity": {
        "type": "integer",
        "unit": "pessoas incluindo condutor",
        "minimum": 1,
        "maximum": 2,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "school_transport_vehicle",
    "version": 1,
    "name": "Transporte escolar",
    "mobility": "mobile",
    "attributes": {
      "occupantCapacity": {
        "type": "integer",
        "unit": "pessoas incluindo condutor",
        "minimum": 1,
        "maximum": 100,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "parking_totem",
    "version": 1,
    "name": "Totem de estacionamento",
    "mobility": "fixed",
    "attributes": {
      "parkingSpaceCount": {
        "type": "integer",
        "unit": "vagas",
        "minimum": 1,
        "maximum": 1000,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "scooter",
    "version": 1,
    "name": "Patinete",
    "mobility": "mobile",
    "attributes": {
      "occupantCapacity": {
        "type": "integer",
        "unit": "pessoas incluindo condutor",
        "minimum": 1,
        "maximum": 2,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "motorcycle",
    "version": 1,
    "name": "Motocicleta",
    "mobility": "mobile",
    "attributes": {
      "occupantCapacity": {
        "type": "integer",
        "unit": "pessoas incluindo condutor",
        "minimum": 1,
        "maximum": 2,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  },
  {
    "code": "official_vehicle",
    "version": 1,
    "name": "Viatura",
    "mobility": "mobile",
    "attributes": {
      "occupantCapacity": {
        "type": "integer",
        "unit": "pessoas incluindo condutor",
        "minimum": 1,
        "maximum": 20,
        "required": true,
        "nullable": false,
        "demonstrationOnly": true
      }
    }
  }
];
export const CATEGORY = CATEGORIES.find(p => p.code === 'fixed_speed_radar')!;
export const CATEGORY_POLICIES = [
  {
    "code": "fixed_speed_radar",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_preventive_check",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": []
  },
  {
    "code": "red_light_radar",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_red_light_inspection",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "turn_radar",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_turn_inspection",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "camera",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_camera_inspection",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "weighing_scale",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_scale_inspection",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "inspection_vehicle",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_inspection_vehicle_review",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "barrier_gate",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_barrier_inspection",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "taxi",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_taxi_review",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "motorcycle_taxi",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_motorcycle_taxi_review",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "school_transport_vehicle",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_school_transport_review",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "parking_totem",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_totem_inspection",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "scooter",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_scooter_review",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "motorcycle",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_motorcycle_review",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  },
  {
    "code": "official_vehicle",
    "version": 1,
    "kind": "equipment",
    "initialMaintenance": {
      "supported": true,
      "causeCode": "initial_official_vehicle_review",
      "scheduleApplicable": true,
      "scheduleRequired": false,
      "allowedScheduleStatuses": [
        "dated",
        "unknown",
        "not_applicable"
      ]
    },
    "allowedInitialStates": [
      "not_installed",
      "operational"
    ],
    "initialStateDefault": "not_installed",
    "initialStateReasonRequiredFor": [
      "operational"
    ]
  }
];
export const profile = (code: unknown, version: unknown = 1) => CATEGORIES.find(p => p.code === code && p.version === version);
export const policy = (code: string) => CATEGORY_POLICIES.find(p => p.code === code)!;
export function attributeFields(category: CategoryProfile): Record<string, Field> {
  return Object.fromEntries(Object.entries(category.attributes).map(([key, a]) => [key, { type: a.type,
    ...(a.type === 'string' ? { min: 1, max: 256 } : { min: a.minimum ?? a.exclusiveMinimum!, max: a.maximum! }) }]));
}
export const attributeUnion: Record<string, Field> = Object.assign({}, ...CATEGORIES.map(p =>
  Object.fromEntries(Object.entries(attributeFields(p)).map(([k, v]) => [k, { ...v, optional: true }]))));
// Broadest static range for a shared property; category-specific range follows receipt lookup.
attributeUnion.occupantCapacity = { type: 'integer', min: 1, max: 100, optional: true };
