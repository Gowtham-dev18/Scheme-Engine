export enum SchemeStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  REJECTED = 'rejected',
  APPROVED = 'approved'
}

export enum ConditionType {
  COMBO = 'combo',
  ASSORTED = 'assorted',
  INVOICE = 'invoice',
  LINE_ITEM = 'lineItem',
  FLEXIBLE_PRODUCT = 'flexibleProduct'
}

export enum MatchType {
  ALL = 'all',
  ANY = 'any',
  NONE = 'none'
}

export enum AggregationBasis {
  QUANTITY = 'quantity',
  AMOUNT = 'amount',
  WEIGHT = 'weight',
  UNITS = 'units'
}

export enum ConditionBasis {
  AMOUNT = 'amount',
  QUANTITY = 'quantity',
  WEIGHT = 'weight'
}

export enum RewardType {
  FREE_PRODUCT = 'freeProduct',
  DISCOUNT_PERCENT = 'discountPercent',
  DISCOUNT_FIXED = 'discountFixed',
  DISCOUNT_PRODUCT = 'discountProduct',
  CASHBACK = 'cashback',
  LOYALTY_POINTS = 'loyaltyPoints',
  PRODUCT_DISCOUNT = 'productDiscount'
}

export enum SchemeAppliedStatus {
  APPLIED = 'applied',
  BLOCKED = 'blocked',
  NOT_APPLICABLE = 'not_applicable',
  EXCLUDED = 'excluded'
}

export enum ProductsEnum {
  ANY_PRODUCT = 'anyProduct',
}


