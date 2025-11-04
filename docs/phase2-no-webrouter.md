# Phase 2 (experiment) - Currently working prototype without Web-Router, uses 3rd-party domain.

```mermaid
graph TB
    subgraph AWS CSS Cloud Account
        HZ[Route 53 Hosted Zone]
        CF[CloudFront Distribution]

        
        subgraph Lambda at Edge
            LAMBDA[Viewer Request Function<br/><i>Shibboleth Auth</i>]
        end
        
        ALB[Application Load Balancer]
        
        subgraph FG[Fargate Cluster]
            subgraph WordPress Task
                WP[WordPress Container<br/>Apache + PHP]
                SIDECAR[SigV4 Proxy Container]
            end
        end
        
        ECR[Elastic Container Registry<br/>WordPress Image]
        SM[Secrets Manager<br/>Configuration]
        RDS[RDS MySQL Database]
        OL[Object Lambda Access Point Authorize]
        S3[S3 Bucket<br/>Assets/Files]
    end

    subgraph USR[User]
        REQ[Request]
        RSP[Response]
    end

    subgraph DNS[3rd Party DNS ]
        NS[<b>NS Records</b>
        -----------------------
        ns-1439.awsdns-51.org.
        ns-31.awsdns-03.com.
        ns-554.awsdns-05.net.
        ns-1979.awsdns-55.co.uk.]
    end

    subgraph BU Network
        IDP[Shibboleth IDP]
    end

    REQ --> DNS
    NS --> HZ
    CF <--> LAMBDA
    LAMBDA <-->|1&rpar; Authenticate| IDP
    LAMBDA <-->|2&rpar; Authenticated| ALB
    ALB <--> WP
    
    WP <-->|Environment Vars| SM
    WP <--> RDS
    WP <-->|assets/*| SIDECAR
    SIDECAR <-->|SigV4 Signed Request| OL
    OL <--> S3
    HZ --> CF
    CF --> RSP
    
    ECR -->|Full manifest<br/>&quot;baked in&quot;| WP
    
    style WP fill:#e3f2fd
    style SIDECAR fill:#e3f2fd
    style CF fill:#fff3e0
    style LAMBDA fill:#f3e5f5
    style S3 fill:#e8f5e8
    
    %% Define custom styling for FG subgraph
    classDef fgSubgraph fill:#f9f9f9,stroke:#008000,stroke-width:4px,color:#008000,font-weight:bold
    
    class FG fgSubgraph
