"""Count named coverage subsets from an actual TRX run; subsets overlap and must not be added."""
from pathlib import Path
import json
import sys
import xml.etree.ElementTree as ET

source = Path(sys.argv[1] if len(sys.argv) > 1 else "TestResults/phase4-unit.trx")
ns = {"t": "http://microsoft.com/schemas/VisualStudio/TeamTest/2010"}
root = ET.parse(source).getroot()
definitions = {test.attrib["id"]: test.find("t:TestMethod", ns).attrib
               for test in root.findall("t:TestDefinitions/t:UnitTest", ns)}
results = root.findall("t:Results/t:UnitTestResult", ns)
predicates = {
    "ML core/import/anomaly": lambda name: ".UnitTests.ML." in name,
    "AI/provider-focused": lambda name: any(term in name for term in (
        "ProviderTests", "ProviderTransportTests", "AIProviderFactoryTests", "AIRoutingService",
        "AiResilienceTests", "PurchaseParsingServiceTests", "Parse_", "Invoice", "AiRateLimit", "ConfiguredProviderClients")),
    "Security-focused": lambda name: any(term in name.lower() for term in (
        "authenticat", "unauth", "revoke", "session", "tenant", "crossbusiness", "foreign", "financial",
        "permission", "forged", "idor", "immutable", "tamper", "protected", "secret", "owneronly",
        "currentmembership", "safety", "credential", "redirect", "oversized")),
}
report = {"source": str(source), "total": len(results), "failed": sum(test.attrib["outcome"] != "Passed" for test in results),
          "counters": root.find("t:ResultSummary/t:Counters", ns).attrib, "groups": {}}
for group, predicate in predicates.items():
    selected = []
    for test in results:
        definition = definitions[test.attrib["testId"]]
        if predicate(definition["className"] + "." + definition["name"]):
            selected.append({"test": test.attrib["testName"], "result": test.attrib["outcome"]})
    report["groups"][group] = {"count": len(selected), "tests": selected}
output = source.with_name("phase4-test-groups.json")
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"total": report["total"], "failed": report["failed"], "groups": {name: value["count"] for name, value in report["groups"].items()}}))
