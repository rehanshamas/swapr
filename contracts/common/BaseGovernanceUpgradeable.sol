// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract BaseGovernanceUpgradeable is Initializable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant PAUSE_MANAGER_ROLE = keccak256("PAUSE_MANAGER_ROLE");
    bytes32 public constant UPGRADE_MANAGER_ROLE = keccak256("UPGRADE_MANAGER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "ERROR: ONLY_ADMIN");
        _;
    }

    function __BaseGovernance_init() internal onlyInitializing {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _setupRole(GOVERNANCE_ROLE, _msgSender());
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(PAUSE_MANAGER_ROLE, _msgSender());
        _setupRole(UPGRADE_MANAGER_ROLE, _msgSender());
    }

    function pause() public onlyRole(PAUSE_MANAGER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSE_MANAGER_ROLE) {
        _unpause();
    }

    /**
    * @dev See {IERC1967Upgradeable-upgrade}.
    * This function is only callable by a governance role, and should be used only for proxy version upgrades
    * @param newImplementation Address of the new implementation.
    */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADE_MANAGER_ROLE) {}
}
