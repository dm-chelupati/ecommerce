#!/bin/bash
# Provisions a private endpoint for Cosmos DB and disables public network access.
# Run from a machine with Azure CLI authenticated (e.g., deployment pipeline or admin workstation).
#
# Usage:
#   ./setup-private-endpoint.sh <SUBSCRIPTION_ID> <RESOURCE_GROUP> <COSMOS_ACCOUNT> <VNET_NAME> <SUBNET_NAME>
#
# Prerequisites:
#   - Azure CLI >= 2.50
#   - Contributor + Network Contributor on the resource group
#   - The target subnet must NOT have a conflicting network policy for private endpoints

set -euo pipefail

SUBSCRIPTION_ID="${1:?Usage: setup-private-endpoint.sh <SUBSCRIPTION_ID> <RESOURCE_GROUP> <COSMOS_ACCOUNT> <VNET_NAME> <SUBNET_NAME>}"
RESOURCE_GROUP="${2:?Missing RESOURCE_GROUP}"
COSMOS_ACCOUNT="${3:?Missing COSMOS_ACCOUNT}"
VNET_NAME="${4:?Missing VNET_NAME}"
SUBNET_NAME="${5:?Missing SUBNET_NAME}"

PE_NAME="pe-${COSMOS_ACCOUNT}"
PE_CONNECTION_NAME="pec-${COSMOS_ACCOUNT}"
DNS_ZONE_NAME="privatelink.documents.azure.com"
DNS_LINK_NAME="dnslink-${VNET_NAME}"

echo "=== Setting subscription ==="
az account set --subscription "${SUBSCRIPTION_ID}"

# ---- 1. Get resource IDs ----
echo "=== Resolving resource IDs ==="
COSMOS_ID=$(az cosmosdb show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${COSMOS_ACCOUNT}" \
  --query "id" -o tsv)

SUBNET_ID=$(az network vnet subnet show \
  --resource-group "${RESOURCE_GROUP}" \
  --vnet-name "${VNET_NAME}" \
  --name "${SUBNET_NAME}" \
  --query "id" -o tsv)

echo "  Cosmos DB : ${COSMOS_ID}"
echo "  Subnet    : ${SUBNET_ID}"

# ---- 2. Disable subnet private-endpoint network policies ----
echo "=== Disabling private-endpoint network policies on subnet ==="
az network vnet subnet update \
  --resource-group "${RESOURCE_GROUP}" \
  --vnet-name "${VNET_NAME}" \
  --name "${SUBNET_NAME}" \
  --disable-private-endpoint-network-policies true \
  --output none

# ---- 3. Create the private endpoint ----
echo "=== Creating private endpoint: ${PE_NAME} ==="
az network private-endpoint create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${PE_NAME}" \
  --vnet-name "${VNET_NAME}" \
  --subnet "${SUBNET_NAME}" \
  --private-connection-resource-id "${COSMOS_ID}" \
  --group-id "Sql" \
  --connection-name "${PE_CONNECTION_NAME}" \
  --output none

PE_NIC_ID=$(az network private-endpoint show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${PE_NAME}" \
  --query "networkInterfaces[0].id" -o tsv)

PE_PRIVATE_IP=$(az network nic show \
  --ids "${PE_NIC_ID}" \
  --query "ipConfigurations[0].privateIpAddress" -o tsv)

echo "  Private IP: ${PE_PRIVATE_IP}"

# ---- 4. Create private DNS zone (idempotent) ----
echo "=== Creating private DNS zone: ${DNS_ZONE_NAME} ==="
az network private-dns zone create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${DNS_ZONE_NAME}" \
  --output none 2>/dev/null || true

# ---- 5. Link DNS zone to VNet ----
echo "=== Linking DNS zone to VNet ==="
az network private-dns link vnet create \
  --resource-group "${RESOURCE_GROUP}" \
  --zone-name "${DNS_ZONE_NAME}" \
  --name "${DNS_LINK_NAME}" \
  --virtual-network "${VNET_NAME}" \
  --registration-enabled false \
  --output none 2>/dev/null || true

# ---- 6. Create DNS zone group on the private endpoint ----
echo "=== Creating DNS zone group ==="
az network private-endpoint dns-zone-group create \
  --resource-group "${RESOURCE_GROUP}" \
  --endpoint-name "${PE_NAME}" \
  --name "cosmos-dns-group" \
  --private-dns-zone "${DNS_ZONE_NAME}" \
  --zone-name "cosmos" \
  --output none

# ---- 7. Disable public network access on Cosmos DB ----
echo "=== Disabling public network access on Cosmos DB ==="
az cosmosdb update \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${COSMOS_ACCOUNT}" \
  --public-network-access DISABLED \
  --output none

# ---- 8. Verify DNS resolution from this machine (optional) ----
echo ""
echo "=== Setup complete ==="
echo "  Private Endpoint : ${PE_NAME}"
echo "  Private IP       : ${PE_PRIVATE_IP}"
echo "  DNS Zone         : ${DNS_ZONE_NAME}"
echo "  Public Access    : Disabled"
echo ""
echo "The VM in VNet '${VNET_NAME}' will now resolve"
echo "  ${COSMOS_ACCOUNT}.documents.azure.com → ${PE_PRIVATE_IP}"
echo ""
echo "Restart the app on the VM to pick up the new route:"
echo "  sudo systemctl restart ecommerce"
