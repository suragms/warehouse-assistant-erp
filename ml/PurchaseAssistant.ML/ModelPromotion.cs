namespace PurchaseAssistant.ML;

public record PromotionDecision(bool Allowed, string Reason, string? CurrentVersion, ErrorMetrics? CurrentValidation, ErrorMetrics? CurrentTest);
public static class ModelPromotion
{
    public static PromotionDecision Evaluate(ModelArtifact candidate, ModelArtifact? current)
    {
        ArtifactStore.Validate(candidate, candidate.BusinessId, candidate.ItemId);
        PromotionDecision Deny(string reason) => new(false, reason, current?.Version, null, null);
        if (string.IsNullOrWhiteSpace(candidate.CodeVersion) || candidate.CodeVersion == "legacy-unrecorded") return Deny("Training code version must be recorded.");
        if (!candidate.QualityAccepted) return Deny("Candidate failed the holdout baseline gate.");
        if (current == null) return new(true, "Initial installation passed the baseline gate; operator must separately approve real-data provenance and intended use.", null, null, null);
        ArtifactStore.Validate(current, candidate.BusinessId, candidate.ItemId);
        if (candidate.Unit != current.Unit || candidate.Version == current.Version) return Deny("Unit changed or candidate is already installed.");
        if (current.TrainingEnd >= candidate.ValidationStart) return Deny("Current model was trained on evaluation dates. Wait for a new untouched validation/holdout period; comparison would leak future labels.");
        var validationHistory = candidate.TrainingHistory.Where(x => x.Date < candidate.ValidationStart).ToList();
        var testHistory = candidate.TrainingHistory.Where(x => x.Date < candidate.TestStart).ToList();
        if (validationHistory.Count < 28 || testHistory.Count < 28) return Deny("Insufficient aligned history for current-model comparison.");
        var validation = ForecastModel.Evaluate(candidate.TrainingHistory.Where(x => x.Date >= candidate.ValidationStart && x.Date <= candidate.ValidationEnd).Select(x => x.Quantity).ToArray(),
            ForecastModel.Predict(current.Model, validationHistory, 30).Select(x => x.Quantity).ToArray());
        var test = ForecastModel.Evaluate(candidate.TrainingHistory.Where(x => x.Date >= candidate.TestStart).Select(x => x.Quantity).ToArray(),
            ForecastModel.Predict(current.Model, testHistory, 30).Select(x => x.Quantity).ToArray());
        var selected = candidate.ValidationMetrics[candidate.Model.Name];
        var allowed = selected.Mae < validation.Mae * .99 && candidate.TestMetrics.Mae < test.Mae * .99
            && candidate.TestMetrics.Rmse <= test.Rmse * 1.1 + 1e-8;
        return new(allowed, allowed ? "Candidate improves validation and holdout MAE by more than 1%, with no greater than 10% holdout RMSE regression and an accepted baseline gate."
            : "Candidate does not satisfy >1% validation/holdout MAE improvement and the RMSE safety gate.", current.Version, validation, test);
    }
}
