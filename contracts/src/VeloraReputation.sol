// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VeloraReputation
 * @notice Soulbound (non-transferable) ERC-721 tokens representing agent reputation.
 *         Each token stores on-chain reputation metrics updated weekly by the Velora backend.
 */
contract VeloraReputation is ERC721, Ownable {
    struct AgentMetrics {
        uint8 reputation;      // 0-100
        uint32 totalSessions;
        uint16 accuracyBps;    // basis points (8500 = 85.00%)
        uint64 lastUpdated;
        string role;
        string model;
    }

    mapping(uint256 => AgentMetrics) public agentMetrics;
    uint256 private _nextTokenId;

    event ReputationUpdated(uint256 indexed tokenId, uint8 reputation, uint16 accuracyBps, uint32 totalSessions);
    event AgentMinted(uint256 indexed tokenId, string role, string model);
    event AgentBurned(uint256 indexed tokenId, string reason);

    constructor() ERC721("Velora Agent Reputation", "VREP") Ownable(msg.sender) {}

    function mintAgent(address instance, string calldata role, string calldata model) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(instance, tokenId);

        agentMetrics[tokenId] = AgentMetrics({
            reputation: 50,
            totalSessions: 0,
            accuracyBps: 0,
            lastUpdated: uint64(block.timestamp),
            role: role,
            model: model
        });

        emit AgentMinted(tokenId, role, model);
        return tokenId;
    }

    function updateReputation(
        uint256 tokenId,
        uint8 reputation,
        uint16 accuracyBps,
        uint32 totalSessions
    ) external onlyOwner {
        require(ownerOf(tokenId) != address(0), "Token does not exist");

        AgentMetrics storage metrics = agentMetrics[tokenId];
        metrics.reputation = reputation;
        metrics.accuracyBps = accuracyBps;
        metrics.totalSessions = totalSessions;
        metrics.lastUpdated = uint64(block.timestamp);

        emit ReputationUpdated(tokenId, reputation, accuracyBps, totalSessions);
    }

    function batchUpdateReputations(
        uint256[] calldata tokenIds,
        uint8[] calldata reputations,
        uint16[] calldata accuracies,
        uint32[] calldata sessions
    ) external onlyOwner {
        require(
            tokenIds.length == reputations.length &&
            tokenIds.length == accuracies.length &&
            tokenIds.length == sessions.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < tokenIds.length; i++) {
            AgentMetrics storage metrics = agentMetrics[tokenIds[i]];
            metrics.reputation = reputations[i];
            metrics.accuracyBps = accuracies[i];
            metrics.totalSessions = sessions[i];
            metrics.lastUpdated = uint64(block.timestamp);

            emit ReputationUpdated(tokenIds[i], reputations[i], accuracies[i], sessions[i]);
        }
    }

    function burnAgent(uint256 tokenId, string calldata reason) external onlyOwner {
        _burn(tokenId);
        delete agentMetrics[tokenId];
        emit AgentBurned(tokenId, reason);
    }

    function getAgentMetrics(uint256 tokenId) external view returns (AgentMetrics memory) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return agentMetrics[tokenId];
    }

    function totalAgents() external view returns (uint256) {
        return _nextTokenId;
    }

    // Soulbound: disable all transfers
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: transfers disabled");
        }
        return super._update(to, tokenId, auth);
    }
}
