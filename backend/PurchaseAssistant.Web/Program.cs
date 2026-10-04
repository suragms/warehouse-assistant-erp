using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Infrastructure.Services;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Auth;
using PurchaseAssistant.Web.Authorization;
using PurchaseAssistant.Web.Services;
using System.Text;
using System.Reflection;
using PurchaseAssistant.Domain.Constants;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Application.DTOs.AI;
using PurchaseAssistant.Application.Interfaces.AI;
using PurchaseAssistant.Infrastructure.Services.AI;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using System.Security.Cryptography.X509Certificates;

var builder = WebApplication.CreateBuilder(args);

// TestServer runs without a registered Windows Event Log source or permission to create one.
// A log-provider failure must not mask the HTTP response an endpoint test is verifying.
if (builder.Environment.IsEnvironment("Testing"))
{
    builder.Logging.ClearProviders();
    builder.Logging.AddConsole();
}

// Add services to the container.
builder.Services.AddControllers(options => { options.Filters.Add<OwnerFinancialResultFilter>(); options.Filters.Add<BusinessEventFilter>(); });
builder.Services.AddSignalR();
builder.Services.AddSingleton<BusinessEvents>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
if (builder.Environment.IsProduction()) ProductionConfiguration.Validate(builder.Configuration);
var databaseConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (!builder.Environment.IsEnvironment("Testing") && string.IsNullOrWhiteSpace(databaseConnectionString))
    throw new InvalidOperationException("Configure ConnectionStrings:DefaultConnection with a local secret or deployment environment variable.");
var protection = builder.Services.AddDataProtection().SetApplicationName("PurchaseAssistant");
var keyRingPath = builder.Configuration["DataProtection:KeyRingPath"];
if (!string.IsNullOrWhiteSpace(keyRingPath))
{
    protection.PersistKeysToFileSystem(new DirectoryInfo(keyRingPath));
    if (OperatingSystem.IsWindows()) protection.ProtectKeysWithDpapi();
    else if (!string.IsNullOrWhiteSpace(builder.Configuration["DataProtection:CertificatePath"]))
        protection.ProtectKeysWithCertificate(X509CertificateLoader.LoadPkcs12FromFile(
            builder.Configuration["DataProtection:CertificatePath"]!, builder.Configuration["DataProtection:CertificatePassword"]));
}
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("ml", context => RateLimitPartition.GetSlidingWindowLimiter(
        context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new SlidingWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6, QueueLimit = 0 }));
    options.AddPolicy("auth", context => RateLimitPartition.GetSlidingWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new SlidingWindowRateLimiterOptions
        { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6, QueueLimit = 0 }));
    options.AddPolicy("ai", context => RateLimitPartition.GetSlidingWindowLimiter(
        context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new SlidingWindowRateLimiterOptions
        { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6, QueueLimit = 0 }));
});

// Settings & DI
var jwtSecret = builder.Configuration["Jwt:SecretKey"];
if (string.IsNullOrWhiteSpace(jwtSecret))
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("Configure Jwt:SecretKey before starting the server.");
    // Development sessions expire when the server restarts; no shared signing secret in source.
    jwtSecret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(64));
}
if (Encoding.UTF8.GetByteCount(jwtSecret) < 32)
    throw new InvalidOperationException("Jwt:SecretKey must contain at least 32 bytes.");
builder.Services.Configure<JwtOptions>(options =>
{
    options.Issuer = "PurchaseAssistant";
    options.Audience = "PurchaseAssistantApp";
    options.SecretKey = jwtSecret;
    options.ExpirationMinutes = 15;
});

builder.Services.Configure<AiOptions>(builder.Configuration.GetSection("AI"));

builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IJwtProvider, JwtProvider>();
builder.Services.AddScoped<IEntityNormalizationService, EntityNormalizationService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<ICategoryTypeService, CategoryTypeService>();
builder.Services.AddScoped<ICatalogService, CatalogService>();
builder.Services.AddScoped<ISupplierService, SupplierService>();
builder.Services.AddScoped<IBrokerService, BrokerService>();
builder.Services.AddScoped<IGlobalSearchService, GlobalSearchService>();
builder.Services.AddScoped<IStockService, StockService>();
builder.Services.AddScoped<IPurchaseService, PurchaseService>();
builder.Services.AddScoped<IPurchaseDamageService, PurchaseDamageService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddSingleton(new PurchaseAssistant.ML.ArtifactStore(builder.Configuration["ML:ArtifactPath"]));
builder.Services.AddScoped<MlService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<BusinessBackupService>();
builder.Services.AddScoped<IAIUsageRecorder, AiUsageRecorder>();
if (!builder.Environment.IsEnvironment("Testing")) builder.Services.AddHostedService<BusinessBackupWorker>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IOperationsService, OperationsService>();
builder.Services.AddScoped<ProviderCredentialService>();
builder.Services.AddScoped<IProviderCredentialResolver>(sp => sp.GetRequiredService<ProviderCredentialService>());
builder.Services.AddSingleton<IBusinessLogoStorage>(new BusinessLogoStorage(
    builder.Environment.IsDevelopment() ? builder.Configuration["Images:StoragePath"] ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data", "logos") : builder.Configuration["Images:StoragePath"]));
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddScoped<ICurrentUserService>(sp => sp.GetRequiredService<CurrentUserService>());
builder.Services.AddScoped<ITenantProvider>(sp => sp.GetRequiredService<CurrentUserService>());

builder.Services.AddScoped<IPurchaseParsingService, PurchaseParsingService>();

builder.Services.AddHttpClient<OpenAIProvider>();
builder.Services.AddHttpClient<GeminiProvider>();
builder.Services.AddHttpClient<GroqProvider>();
builder.Services.AddHttpClient<OpenRouterProvider>();
// Fixed provider hosts must not forward credentials through redirects or buffer unbounded responses.
foreach (var providerName in new[] { nameof(OpenAIProvider), nameof(GeminiProvider), nameof(GroqProvider), nameof(OpenRouterProvider) })
    builder.Services.AddHttpClient(providerName, client => { client.Timeout = TimeSpan.FromSeconds(20); client.MaxResponseContentBufferSize = 1_000_000; })
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false }).RemoveAllLoggers();
builder.Services.AddScoped<IAIProvider>(sp => new OpenAIProvider(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(OpenAIProvider)), builder.Configuration["AI:Providers:OpenAI:ApiKey"] ?? ""));
builder.Services.AddScoped<IAIProvider>(sp => new GeminiProvider(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(GeminiProvider)), builder.Configuration["AI:Providers:Gemini:ApiKey"] ?? ""));
builder.Services.AddScoped<IAIProvider>(sp => new GroqProvider(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(GroqProvider)), builder.Configuration["AI:Providers:Groq:ApiKey"] ?? ""));
builder.Services.AddScoped<IAIProvider>(sp => new OpenRouterProvider(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(OpenRouterProvider)), builder.Configuration["AI:Providers:OpenRouter:ApiKey"] ?? ""));
builder.Services.AddScoped<IAIProvider, StubAIProvider>();
builder.Services.AddScoped<IAIProviderFactory>(sp => new AIProviderFactory(sp.GetServices<IAIProvider>(), sp.GetRequiredService<IProviderCredentialResolver>(), sp.GetRequiredService<IHttpClientFactory>().CreateClient));
builder.Services.AddScoped<IAIRoutingService, AIRoutingService>();
builder.Services.AddScoped<AiRuntimeSettings>();
builder.Services.AddScoped<WhatsAppDeliveryService>();
builder.Services.AddScoped<InvoiceTextService>();
builder.Services.AddHttpClient("WhatsApp", c => c.Timeout = TimeSpan.FromSeconds(45)).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false }).RemoveAllLoggers();
builder.Services.AddSingleton<AiCircuitBreaker>();

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(databaseConnectionString!);
    options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
});

// Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context => {
                if (context.HttpContext.Request.Path.StartsWithSegments("/api/v1/realtime") && context.Request.Query.TryGetValue("access_token", out var token)) context.Token = token;
                return Task.CompletedTask;
            },
            OnTokenValidated = async context =>
            {
                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                if (context.Principal == null || !await CurrentUserService.ValidateSessionAsync(context.Principal, db))
                    context.Fail("The account or business membership is no longer active.");
            }
        };
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "PurchaseAssistant",
            ValidAudience = "PurchaseAssistantApp",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = System.TimeSpan.Zero,
            RoleClaimType = "role"
        };
    });

// Authorization Policies
builder.Services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireSelectedBusiness", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId"));
    // Define commonly used policies safely
    options.AddPolicy("RequireUsersView", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").RequireRole("Owner", "Admin", "Manager", "SuperAdmin").AddRequirements(new PermissionRequirement(Permissions.UsersView)));
    options.AddPolicy("RequireUsersManage", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").RequireRole("Owner", "Admin", "Manager", "SuperAdmin").AddRequirements(new PermissionRequirement(Permissions.UsersManage)));
    options.AddPolicy("RequireCatalogView", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.CatalogView)));
    options.AddPolicy("RequireCatalogCreate", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.CatalogCreate)));
    options.AddPolicy("RequireCatalogEdit", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.CatalogEdit)));
    options.AddPolicy("RequireCatalogArchive", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.CatalogArchive)));
    options.AddPolicy("RequireSupplierView", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.SupplierView)));
    options.AddPolicy("RequireSupplierCreate", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.SupplierCreate)));
    options.AddPolicy("RequireSupplierEdit", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.SupplierEdit)));
    options.AddPolicy("RequireSupplierDelete", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.SupplierDelete)));
    options.AddPolicy("RequireBrokerView", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.BrokerView)));
    options.AddPolicy("RequireBrokerCreate", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.BrokerCreate)));
    options.AddPolicy("RequireBrokerEdit", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.BrokerEdit)));
    options.AddPolicy("RequireBrokerDelete", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.BrokerDelete)));
    options.AddPolicy("RequireStockView", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.StockView)));
    options.AddPolicy("RequireStockAdjust", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.StockAdjust)));
    options.AddPolicy("RequireStockPhysical", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.StockPhysical)));
    options.AddPolicy("RequireStockSystem", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.StockSystem)));
    options.AddPolicy("RequireReportsView", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.ReportsView)));
    options.AddPolicy("RequirePurchaseView", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseView)));
    options.AddPolicy("RequirePurchaseCreate", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseCreate)));
    options.AddPolicy("RequirePurchaseEdit", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseEdit)));
    options.AddPolicy("RequirePurchaseDelete", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseDelete)));
    options.AddPolicy("RequirePurchaseVerify", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseVerify)));
    options.AddPolicy("RequirePurchaseDelivery", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseDelivery)));
    options.AddPolicy("RequirePurchaseCommit", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseCommit)));
    options.AddPolicy("RequireDamageReport", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseDamageReport)));
    options.AddPolicy("RequireDamageApprove", policy => policy.RequireAuthenticatedUser().RequireClaim("businessId").AddRequirements(new PermissionRequirement(Permissions.PurchaseDamageApprove)));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", b =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? (builder.Environment.IsDevelopment() ? new[] { "http://localhost:5173", "http://localhost:5174", "http://localhost:3000" } : Array.Empty<string>());
        b.WithOrigins(origins)
         .AllowAnyHeader()
         .AllowAnyMethod()
         .WithExposedHeaders("Content-Disposition")
         .AllowCredentials();
    });
});

var app = builder.Build();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.ContentType = "application/json";

        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        var status = exception switch
        {
            DbUpdateConcurrencyException => 409,
            DbUpdateException { InnerException: Npgsql.PostgresException { SqlState: "23505" } } => 409,
            ArgumentException => 400,
            KeyNotFoundException => 404,
            UnauthorizedAccessException => 403,
            _ => 500
        };
        var safeMessage = status switch
        {
            409 => "The record changed or already exists. Refresh before retrying.",
            400 => "Check the submitted fields and try again.",
            404 => "The requested record was not found in this business.",
            403 => "You do not have permission to perform this action.",
            _ => "An unexpected error occurred."
        };
        var response = new
        {
            error = new
            {
                code = status == 409 ? "VERSION_OR_DUPLICATE_CONFLICT" : status == 400 ? "VALIDATION_ERROR" : status == 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
                message = safeMessage,
                requestId = context.TraceIdentifier
            }
        };

        context.Response.StatusCode = status;
        await context.Response.WriteAsync(JsonSerializer.Serialize(response));
    });
});

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    // app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapControllers();
app.MapHub<BusinessEventsHub>("/api/v1/realtime", options => options.CloseOnAuthenticationExpiration = true);
app.MapGet("/health/live", () => Results.Ok(new { status = "alive" })).AllowAnonymous();
app.MapGet("/health/ready", async (AppDbContext db, CancellationToken ct) =>
{
    try
    {
        var ready = await db.Database.CanConnectAsync(ct) && !(await db.Database.GetPendingMigrationsAsync(ct)).Any()
            && !db.Database.HasPendingModelChanges();
        return Results.Json(new { status = ready ? "ready" : "unavailable" }, statusCode: ready ? 200 : 503);
    }
    catch (Exception)
    {
        return Results.Json(new { status = "unavailable" }, statusCode: 503);
    }
}).AllowAnonymous();

// Ensure Database is migrated and seeded with default admin
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

    try
    {
        await db.Database.MigrateAsync();

        if (!await db.Users.AnyAsync())
        {
            var business = new Business
            {
                Id = Guid.NewGuid(),
                Name = "Main Warehouse",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            db.Businesses.Add(business);
            Console.WriteLine("Seeded initial business.");
        }

        // Seed missing defaults only; never replace an existing explicit permission set on startup.
        var adminUser = await db.Users.FirstOrDefaultAsync(u => u.Email == "admin@warehouse.local");
        if (adminUser != null)
        {
            var membership = await db.Memberships.FirstOrDefaultAsync(m => m.UserId == adminUser.Id);
            if (membership != null && string.IsNullOrWhiteSpace(membership.PermissionsJson))
            {
                membership.PermissionsJson = JsonSerializer.Serialize(Permissions.ForRole(membership.Role));
                await db.SaveChangesAsync();
                Console.WriteLine("Verified/Updated permissions for admin user.");
            }
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"DB Migration/Seed Warning: {ex.Message}");
    }
}

app.Run();

public partial class Program { }
