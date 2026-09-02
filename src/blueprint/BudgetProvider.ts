/**
 * Spec 6: "cost comes from a budget provider. P0's provider returns a constant. The
 * extraction economy replaces that one object."
 */
export interface BudgetProvider {
  /** Material units available to spend on a blueprint for this run. */
  materialBudget(): number;
}

export class ConstantBudgetProvider implements BudgetProvider {
  private readonly budget: number;

  public constructor(budget: number) {
    this.budget = budget;
  }

  public materialBudget(): number {
    return this.budget;
  }
}
