# AWS ElastiCache Deployment

Deploy Valkey Admin on AWS to monitor an ElastiCache Valkey cluster.

## Quick Start

If you already have an EC2 instance (or ECS, Fargate, etc.) with network access to your ElastiCache cluster, run:

```bash
docker run -d --name valkey-admin \
  -p 8080:8080 \
  -e DEPLOYMENT_MODE=Web \
  --restart unless-stopped \
  public.ecr.aws/valkey/valkey-admin:latest
```

Open `http://<your-instance-ip>:8080` and add a connection to your ElastiCache endpoint through the UI.

For IAM authentication, ensure the instance's IAM role has `elasticache:Connect` permission scoped to your replication group and user.

---

## Production Deployment

For a production setup, we recommend the following architecture with HTTPS, Cognito authentication, and network isolation.

### Architecture

```
Internet → ALB (HTTPS + Cognito auth, public subnets) → EC2 (private subnet) → ElastiCache (private subnet)
```

- **ALB (Application Load Balancer):** Provides internet-facing HTTPS access to Valkey Admin. We recommend an ALB rather than exposing the EC2 instance directly so that the instance stays in a private subnet with no public IP. The ALB integrates with [Amazon Cognito](https://aws.amazon.com/cognito/) for user authentication and uses IP-based security group rules as an additional layer of defense.
- **Amazon Cognito:** Handles user authentication. Users must sign in before accessing Valkey Admin. The template creates a Cognito User Pool — add users through the AWS Console or CLI after deployment.
- **EC2 instance:** Runs the Valkey Admin Docker container in a private subnet. Outbound internet access is provided through a NAT Gateway for pulling the Docker image and system updates.
- **ElastiCache cluster:** The Valkey cluster being monitored, also in a private subnet. Only accessible from the EC2 instance.

### Prerequisites

- AWS CLI configured with appropriate permissions
- A domain name with a DNS record pointing to the ALB (required for HTTPS)
- An ACM certificate for your domain (can be requested through the [AWS Certificate Manager console](https://console.aws.amazon.com/acm/))
- An IP address to whitelist for ALB access

### CloudFormation Template

The template below creates a complete deployment with:
- VPC with public and private subnets
- NAT Gateway for outbound access from private subnets
- ElastiCache Valkey cluster with IAM and password authentication
- EC2 instance (Docker pre-installed via user data)
- ALB with HTTPS, Cognito authentication, and IP-restricted access
- Cognito User Pool for user management
- IAM role with `elasticache:Connect` permission

Save the following as `valkey-admin-elasticache.yml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Valkey Admin with ElastiCache cluster, Cognito auth, and HTTPS

Parameters:
  AllowedIP:
    Type: String
    Description: Your public IP address for ALB access (e.g., 203.0.113.10)
  CertificateArn:
    Type: String
    Description: ARN of the ACM certificate for HTTPS
  DomainName:
    Type: String
    Description: Domain name for the Cognito callback URL (e.g., valkey-admin.example.com)
  NumShards:
    Type: Number
    Default: 3
    Description: Number of shards in the ElastiCache cluster
  ReplicasPerShard:
    Type: Number
    Default: 0
    Description: Number of replicas per shard
  InstanceType:
    Type: String
    Default: t3.medium
    Description: EC2 instance type (see Resource Sizing in README)
  LatestAmiId:
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>
    Default: /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64

Resources:
  # --- Networking ---
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: !Ref AWS::StackName
        - Key: Owner
          Value: !Ref AWS::StackName

  InternetGateway:
    Type: AWS::EC2::InternetGateway

  AttachGateway:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref VPC
      InternetGatewayId: !Ref InternetGateway

  PublicSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.1.0/24
      MapPublicIpOnLaunch: true
      AvailabilityZone: !Select [0, !GetAZs ""]

  PublicSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.2.0/24
      MapPublicIpOnLaunch: true
      AvailabilityZone: !Select [1, !GetAZs ""]

  PrivateSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.3.0/24
      AvailabilityZone: !Select [0, !GetAZs ""]

  PrivateSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.4.0/24
      AvailabilityZone: !Select [1, !GetAZs ""]

  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC

  PublicRoute:
    Type: AWS::EC2::Route
    DependsOn: AttachGateway
    Properties:
      RouteTableId: !Ref PublicRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref InternetGateway

  PublicSubnetRouteAssoc1:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet1
      RouteTableId: !Ref PublicRouteTable

  PublicSubnetRouteAssoc2:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet2
      RouteTableId: !Ref PublicRouteTable

  NatEIP:
    Type: AWS::EC2::EIP

  NatGateway:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatEIP.AllocationId
      SubnetId: !Ref PublicSubnet1

  PrivateRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC

  PrivateRoute:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway

  PrivateSubnetRouteAssoc1:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PrivateSubnet1
      RouteTableId: !Ref PrivateRouteTable

  PrivateSubnetRouteAssoc2:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PrivateSubnet2
      RouteTableId: !Ref PrivateRouteTable

  # --- Security Groups ---
  ALBSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref VPC
      GroupDescription: ALB - allow HTTPS from whitelisted IP
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: !Sub "${AllowedIP}/32"
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: !Sub "${AllowedIP}/32"

  EC2SecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref VPC
      GroupDescription: EC2 - allow traffic from ALB only
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 8080
          ToPort: 8080
          SourceSecurityGroupId: !Ref ALBSecurityGroup

  ValkeySecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref VPC
      GroupDescription: ElastiCache - allow traffic from EC2 only
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 6379
          ToPort: 6379
          SourceSecurityGroupId: !Ref EC2SecurityGroup

  # --- Cognito ---
  CognitoUserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: !Sub "${AWS::StackName}-users"
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: true
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireUppercase: true
          RequireLowercase: true
          RequireNumbers: true
          RequireSymbols: false
      Schema:
        - Name: email
          Required: true
          Mutable: true

  CognitoUserPoolDomain:
    Type: AWS::Cognito::UserPoolDomain
    Properties:
      Domain: !Sub "${AWS::StackName}-${AWS::AccountId}"
      UserPoolId: !Ref CognitoUserPool

  CognitoUserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      ClientName: !Sub "${AWS::StackName}-alb"
      UserPoolId: !Ref CognitoUserPool
      GenerateSecret: true
      AllowedOAuthFlows:
        - code
      AllowedOAuthScopes:
        - openid
      AllowedOAuthFlowsUserPoolClient: true
      CallbackURLs:
        - !Sub "https://${DomainName}/oauth2/idpresponse"
      SupportedIdentityProviders:
        - COGNITO

  # --- ElastiCache ---
  ValkeyIAMUser:
    Type: AWS::ElastiCache::User
    Properties:
      UserId: !Sub "${AWS::StackName}-iam-user"
      UserName: !Sub "${AWS::StackName}-iam-user"
      Engine: redis
      AccessString: "on ~* +@all"
      AuthenticationMode:
        Type: iam

  ValkeyPasswordUser:
    Type: AWS::ElastiCache::User
    Properties:
      UserId: !Sub "${AWS::StackName}-pw-user"
      UserName: !Sub "${AWS::StackName}-pw-user"
      Engine: redis
      AccessString: "on ~* +@all"
      Passwords:
        - !Sub "${AWS::StackName}-Password123!"

  ValkeyDefaultUser:
    Type: AWS::ElastiCache::User
    Properties:
      UserId: !Sub "${AWS::StackName}-default"
      UserName: default
      Engine: redis
      AccessString: "off -@all"
      AuthenticationMode:
        Type: no-password-required

  ValkeyUserGroup:
    Type: AWS::ElastiCache::UserGroup
    Properties:
      UserGroupId: !Sub "${AWS::StackName}-users"
      Engine: redis
      UserIds:
        - !Ref ValkeyIAMUser
        - !Ref ValkeyPasswordUser
        - !Ref ValkeyDefaultUser

  CacheSubnetGroup:
    Type: AWS::ElastiCache::SubnetGroup
    Properties:
      Description: Valkey subnet group
      SubnetIds:
        - !Ref PrivateSubnet1
        - !Ref PrivateSubnet2

  ValkeyCluster:
    Type: AWS::ElastiCache::ReplicationGroup
    Properties:
      ReplicationGroupDescription: !Sub "${AWS::StackName} Valkey cluster"
      Engine: valkey
      CacheNodeType: cache.t3.micro
      NumNodeGroups: !Ref NumShards
      ReplicasPerNodeGroup: !Ref ReplicasPerShard
      ClusterMode: enabled
      TransitEncryptionEnabled: true
      AtRestEncryptionEnabled: true
      AutomaticFailoverEnabled: !If [HasReplicas, true, false]
      MultiAZEnabled: !If [HasReplicas, true, false]
      UserGroupIds:
        - !Ref ValkeyUserGroup
      CacheSubnetGroupName: !Ref CacheSubnetGroup
      SecurityGroupIds:
        - !Ref ValkeySecurityGroup

  # --- EC2 ---
  EC2Role:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: ec2.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
      Policies:
        - PolicyName: ElastiCacheIAMAuth
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action: elasticache:Connect
                Resource:
                  - !Sub "arn:aws:elasticache:${AWS::Region}:${AWS::AccountId}:replicationgroup:${ValkeyCluster}"
                  - !Sub "arn:aws:elasticache:${AWS::Region}:${AWS::AccountId}:user:${ValkeyIAMUser}"

  EC2InstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      Roles:
        - !Ref EC2Role

  EC2Instance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: !Ref InstanceType
      ImageId: !Ref LatestAmiId
      SubnetId: !Ref PrivateSubnet1
      SecurityGroupIds:
        - !Ref EC2SecurityGroup
      IamInstanceProfile: !Ref EC2InstanceProfile
      BlockDeviceMappings:
        - DeviceName: /dev/xvda
          Ebs:
            Encrypted: true
            VolumeSize: 30
      MetadataOptions:
        HttpTokens: required
        HttpPutResponseHopLimit: 2
      UserData:
        Fn::Base64: !Sub |
          #!/bin/bash
          set -e
          yum install -y docker
          systemctl enable docker && systemctl start docker
          docker run -d --name valkey-admin \
            -p 8080:8080 \
            -e DEPLOYMENT_MODE=Web \
            --restart unless-stopped \
            public.ecr.aws/valkey/valkey-admin:latest
      Tags:
        - Key: Name
          Value: !Ref AWS::StackName
        - Key: Owner
          Value: !Ref AWS::StackName

  # --- ALB ---
  ALB:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Scheme: internet-facing
      Subnets:
        - !Ref PublicSubnet1
        - !Ref PublicSubnet2
      SecurityGroups:
        - !Ref ALBSecurityGroup
      Type: application

  TargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      VpcId: !Ref VPC
      Port: 8080
      Protocol: HTTP
      TargetType: instance
      Targets:
        - Id: !Ref EC2Instance
          Port: 8080
      HealthCheckPath: /
      HealthCheckProtocol: HTTP

  HTTPListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref ALB
      Port: 80
      Protocol: HTTP
      DefaultActions:
        - Type: redirect
          RedirectConfig:
            Protocol: HTTPS
            Port: "443"
            StatusCode: HTTP_301

  HTTPSListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref ALB
      Port: 443
      Protocol: HTTPS
      Certificates:
        - CertificateArn: !Ref CertificateArn
      DefaultActions:
        - Type: authenticate-cognito
          Order: 1
          AuthenticateCognitoConfig:
            UserPoolArn: !GetAtt CognitoUserPool.Arn
            UserPoolClientId: !Ref CognitoUserPoolClient
            UserPoolDomain: !Sub "${AWS::StackName}-${AWS::AccountId}"
        - Type: forward
          Order: 2
          TargetGroupArn: !Ref TargetGroup

Conditions:
  HasReplicas: !Not [!Equals [!Ref ReplicasPerShard, 0]]

Outputs:
  URL:
    Description: Valkey Admin URL
    Value: !Sub "https://${DomainName}"
  ALBDNSName:
    Description: ALB DNS name (create a CNAME record pointing your domain here)
    Value: !GetAtt ALB.DNSName
  ValkeyEndpoint:
    Description: ElastiCache configuration endpoint
    Value: !GetAtt ValkeyCluster.ConfigurationEndPoint.Address
  ReplicationGroupId:
    Description: ElastiCache replication group ID (needed for IAM auth)
    Value: !Ref ValkeyCluster
  IAMUsername:
    Description: IAM authentication username
    Value: !Sub "${AWS::StackName}-iam-user"
  PasswordUsername:
    Description: Password authentication username
    Value: !Sub "${AWS::StackName}-pw-user"
  PasswordHint:
    Description: Password format
    Value: !Sub "${AWS::StackName}-Password123!"
  CognitoUserPoolId:
    Description: Cognito User Pool ID (use to create users)
    Value: !Ref CognitoUserPool
```

### Deploy

### 1. Request an ACM Certificate

If you don't already have one, request a certificate in the [ACM console](https://console.aws.amazon.com/acm/) for your domain. Note the certificate ARN after validation.

### 2. Create the Stack

```bash
aws cloudformation create-stack \
  --stack-name valkey-admin \
  --template-body file://valkey-admin-elasticache.yml \
  --parameters \
    ParameterKey=AllowedIP,ParameterValue=$(curl -s https://checkip.amazonaws.com) \
    ParameterKey=CertificateArn,ParameterValue=arn:aws:acm:us-west-1:123456789012:certificate/your-cert-id \
    ParameterKey=DomainName,ParameterValue=valkey-admin.example.com \
    ParameterKey=NumShards,ParameterValue=3 \
  --capabilities CAPABILITY_IAM \
  --region us-west-1
```

Wait for the stack to complete (~15-20 minutes for the ElastiCache cluster):

```bash
aws cloudformation wait stack-create-complete --stack-name valkey-admin --region us-west-1
```

### 3. Configure DNS

Get the ALB DNS name from the stack outputs:

```bash
aws cloudformation describe-stacks --stack-name valkey-admin --region us-west-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" --output text
```

Create a CNAME record in your DNS provider pointing your domain to the ALB DNS name.

### 4. Create Cognito Users

```bash
POOL_ID=$(aws cloudformation describe-stacks --stack-name valkey-admin --region us-west-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" --output text)

aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com \
  --region us-west-1
```

The user will receive a temporary password via email and be prompted to set a new password on first login.

### Connect

Open `https://your-domain.com`. After signing in through Cognito, add a connection:

**Password authentication:**
- Host: the `ValkeyEndpoint` from outputs
- Port: 6379
- TLS: enabled
- Endpoint type: cluster-endpoint
- Username: the `PasswordUsername` from outputs
- Password: the `PasswordHint` from outputs

**IAM authentication:**
- Host: the `ValkeyEndpoint` from outputs
- Port: 6379
- TLS: enabled
- Endpoint type: cluster-endpoint
- Auth type: IAM
- Username: the `IAMUsername` from outputs
- Replication Group ID: the `ReplicationGroupId` from outputs
- AWS Region: the region you deployed to

### Whitelist Additional IPs

To grant network access to additional users, add their IP to the ALB security group:

```bash
ALB_SG=$(aws cloudformation describe-stack-resource \
  --stack-name valkey-admin \
  --logical-resource-id ALBSecurityGroup \
  --query "StackResourceDetail.PhysicalResourceId" \
  --output text --region us-west-1)

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 443 \
  --cidr <IP_ADDRESS>/32 \
  --region us-west-1
```

### Tear Down

```bash
aws cloudformation delete-stack --stack-name valkey-admin --region us-west-1
```

### Security Notes

- All traffic is encrypted via HTTPS (HTTP requests are redirected to HTTPS)
- Users must authenticate through Amazon Cognito before accessing the application
- IP-based security group rules provide an additional layer of network-level access control
- The EC2 instance has **no public IP** — it is only accessible through the ALB
- ElastiCache is in a private subnet, accessible only from the EC2 instance
- EBS volumes are encrypted at rest
- IMDSv2 is required on the EC2 instance
- The IAM role follows least privilege — only `elasticache:Connect` is granted
- TLS is enabled for all ElastiCache connections
